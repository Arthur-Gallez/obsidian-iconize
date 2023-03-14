import emoji from './emoji';
import IconFolderPlugin, { FolderIconObject } from './main';
import type { ExplorerView } from './@types/obsidian';
import { CustomRule, IconFolderSettings } from './settings';
import { TAbstractFile, TFile } from 'obsidian';
import dom from './lib/dom';
import customRule from './lib/customRule';
// import iconTabs from './lib/iconTabs';

/**
 * This function adds the icons to the DOM.
 * For that, it will create a `div` element with the class `obsidian-icon-folder-icon` that will be customized based on the user settings.
 *
 * @public
 * @param {IconFolderPlugin} plugin - The main plugin.
 * @param {[string, string | FolderIconObject][]} data - The data that includes the icons.
 * @param {WeakMap<ExplorerLeaf, boolean>} registeredFileExplorers - The already registered file explorers.
 */
export const addIconsToDOM = (
  plugin: IconFolderPlugin,
  data: [string, string | FolderIconObject][],
  registeredFileExplorers: WeakSet<ExplorerView>,
  callback?: () => void,
): void => {
  const fileExplorers = plugin.app.workspace.getLeavesOfType('file-explorer');
  fileExplorers.forEach((fileExplorer) => {
    if (registeredFileExplorers.has(fileExplorer.view)) {
      return;
    }

    registeredFileExplorers.add(fileExplorer.view);

    // create a map with registered file paths to have constant look up time
    const registeredFilePaths: Record<string, boolean> = {};
    data.forEach(([path]) => {
      registeredFilePaths[path] = true;
    });

    data.forEach(([dataPath, value]) => {
      const fileItem = fileExplorer.view.fileItems[dataPath];
      if (fileItem) {
        const titleEl = fileItem.titleEl;
        const titleInnerEl = fileItem.titleInnerEl;

        // needs to check because of the refreshing the plugin will duplicate all the icons
        if (titleEl.children.length === 2 || titleEl.children.length === 1) {
          const iconName = typeof value === 'string' ? value : value.iconName;
          if (iconName) {
            const existingIcon = titleEl.querySelector('.obsidian-icon-folder-icon');
            if (existingIcon) {
              existingIcon.remove();
            }

            const iconNode = titleEl.createDiv();
            iconNode.classList.add('obsidian-icon-folder-icon');

            dom.setIconForNode(plugin, iconName, iconNode);

            titleEl.insertBefore(iconNode, titleInnerEl);
          }

          if (typeof value === 'object' && value.inheritanceIcon) {
            const files = plugin.app.vault.getFiles().filter((f) => f.path.includes(dataPath));
            const inheritanceIconName = value.inheritanceIcon;
            files.forEach((f) => {
              if (!registeredFilePaths[f.path]) {
                const inheritanceFileItem = fileExplorer.view.fileItems[f.path];
                const existingIcon = inheritanceFileItem.titleEl.querySelector('.obsidian-icon-folder-icon');
                if (existingIcon) {
                  existingIcon.remove();
                }

                const iconNode = inheritanceFileItem.titleEl.createDiv();
                iconNode.classList.add('obsidian-icon-folder-icon');

                dom.setIconForNode(plugin, inheritanceIconName, iconNode);

                inheritanceFileItem.titleEl.insertBefore(iconNode, inheritanceFileItem.titleInnerEl);
              }
            });
          }
        }
      }
    });

    updateCustomIconRules(plugin, fileExplorer.view);

    if (callback) {
      callback();
    }
  });
};

const updateCustomIconRules = (plugin: IconFolderPlugin, view: ExplorerView) => {
  const addCustomIconRule = (rule: CustomRule, file: TAbstractFile) => {
    const fileItem = view.fileItems[file.path];
    if (fileItem) {
      const titleEl = fileItem.titleEl;
      const titleInnerEl = fileItem.titleInnerEl;
      const existingIcon = titleEl.querySelector('.obsidian-icon-folder-icon');
      if (!existingIcon) {
        const iconNode = titleEl.createDiv();
        iconNode.classList.add('obsidian-icon-folder-icon');

        dom.setIconForNode(plugin, rule.icon, iconNode, rule.color);

        titleEl.insertBefore(iconNode, titleInnerEl);
      }
    }
  };

  // Add custom rule icons.
  plugin.getSettings().rules.forEach((rule) => {
    try {
      // Rule is in some sort of regex.
      const regex = new RegExp(rule.rule);
      plugin.app.vault.getAllLoadedFiles().forEach(async (file) => {
        const fileType = (await plugin.app.vault.adapter.stat(file.path)).type;
        if (file.name.match(regex) && isToRuleApplicable(rule, fileType)) {
          addCustomIconRule(rule, file);
        }
      });
    } catch {
      // Rule is not applicable to a regex format.
      plugin.app.vault.getAllLoadedFiles().forEach(async (file) => {
        const fileType = (await plugin.app.vault.adapter.stat(file.path)).type;
        if (file.name.includes(rule.rule) && isToRuleApplicable(rule, fileType)) {
          addCustomIconRule(rule, file);
        }
      });
    }
  });
};

export const updateIcon = (plugin: IconFolderPlugin, file: TAbstractFile) => {
  // Try to add custom rule icons back.
  plugin.getSettings().rules.forEach(async (rule) => {
    addCustomRuleIconsToDOM(plugin, rule, file);
  });
};

export const updateEmojiIconsInDOM = (plugin: IconFolderPlugin): void => {
  plugin.getRegisteredFileExplorers().forEach(async (explorerView) => {
    const files = Object.entries(explorerView.fileItems);
    files.forEach(async ([path]) => {
      const iconName =
        typeof plugin.getData()[path] === 'object'
          ? (plugin.getData()[path] as FolderIconObject).iconName
          : (plugin.getData()[path] as string);

      if (emoji.isEmoji(iconName)) {
        dom.createIconNode(plugin, path, iconName);
      }
    });

    updateCustomIconRules(plugin, explorerView);
  });
};

/**
 * This function removes the specified rule from all the loaded files in the vault.
 *
 * @param {IconFolderPlugin} plugin - The main plugin.
 * @param {CustomRule} rule - Specific rule that will match all loaded files.
 */
export const removeCustomRuleIconsFromDOM = (plugin: IconFolderPlugin, rule: CustomRule): void => {
  const inheritanceFolders = Object.entries(plugin.getData()).filter(
    ([k, v]) => k !== 'settings' && typeof v === 'object',
  );

  const openFiles = plugin.app.workspace.getLeavesOfType('markdown').reduce<Record<string, TFile>>((prev, curr) => {
    if (curr.view.file) {
      prev[curr.view.file.path] = curr.view.file;
    }
    return prev;
  }, {});

  plugin.getRegisteredFileExplorers().forEach(async (explorerView) => {
    const files = Object.entries(explorerView.fileItems);
    files.forEach(async ([path, fileItem]) => {
      const stat = await plugin.app.vault.adapter.stat(path);
      const fileType = stat.type;
      const dataFile =
        typeof plugin.getData()[path] === 'object'
          ? (plugin.getData()[path] as FolderIconObject).iconName
          : plugin.getData()[path];
      const isInfluencedByInheritance = inheritanceFolders.find(([key]) => path.includes(key) && fileType === 'file');

      const existingIcon = dataFile || isInfluencedByInheritance;
      if (!existingIcon && customRule.doesExistInPath(rule, path) && isToRuleApplicable(rule, fileType)) {
        if (plugin.getSettings().iconInTabsEnabled && fileType === 'file') {
          // iconTabs.remove(openFiles[path], { replaceWithDefaultIcon: true });
        }

        dom.removeIconInNode(fileItem.titleEl);
      }
    });
  });
};

export const colorizeCustomRuleIcons = (plugin: IconFolderPlugin, rule: CustomRule): void => {
  try {
    // Rule is in some sort of regex.
    const regex = new RegExp(rule.rule);
    plugin.app.vault.getAllLoadedFiles().forEach(async (file) => {
      const fileType = (await plugin.app.vault.adapter.stat(file.path)).type;
      if (file.name.match(regex) && isToRuleApplicable(rule, fileType)) {
        dom.createIconNode(plugin, file.path, rule.icon, rule.color);
      }
    });
  } catch {
    // Rule is not applicable to a regex format.
    plugin.app.vault.getAllLoadedFiles().forEach(async (file) => {
      const fileType = (await plugin.app.vault.adapter.stat(file.path)).type;
      if (file.name.includes(rule.rule) && isToRuleApplicable(rule, fileType)) {
        dom.createIconNode(plugin, file.path, rule.icon, rule.color);
      }
    });
  }
};

const isToRuleApplicable = (rule: CustomRule, fileType: 'file' | 'folder'): boolean => {
  return (
    rule.for === 'everything' ||
    (rule.for === 'files' && fileType === 'file') ||
    (rule.for === 'folders' && fileType === 'folder')
  );
};

/**
 * This function adds to all the loaded files the icon based on the specific rule.
 *
 * @param {IconFolderPlugin} plugin - The main plugin.
 * @param {CustomRule} rule - The custom rule for adding the icon.
 * @param {TAbstractFile} file - Optional parameter if the rule should only be applied to one specific file.
 */
export const addCustomRuleIconsToDOM = async (
  plugin: IconFolderPlugin,
  rule: CustomRule,
  file?: TAbstractFile,
): Promise<void> => {
  const openFiles = plugin.app.workspace.getLeavesOfType('markdown').reduce<Record<string, TFile>>((prev, curr) => {
    if (curr.view.file) {
      prev[curr.view.file.path] = curr.view.file;
    }
    return prev;
  }, {});

  try {
    // Rule is in some sort of regex.
    const regex = new RegExp(rule.rule);
    if (file) {
      const fileType = (await plugin.app.vault.adapter.stat(file.path)).type;
      if (file.name.match(regex) && isToRuleApplicable(rule, fileType)) {
        if (plugin.getSettings().iconInTabsEnabled && fileType === 'file') {
          // iconTabs.add(plugin, file as TFile, { iconName: rule.icon });
        }

        dom.createIconNode(plugin, file.path, rule.icon, rule.color);
      }
    } else {
      plugin.getRegisteredFileExplorers().forEach(async (explorerView) => {
        const files = Object.entries(explorerView.fileItems);
        files.forEach(async ([path, fileItem]) => {
          const fileType = (await plugin.app.vault.adapter.stat(path)).type;
          if (fileItem) {
            const fileName = path.split('/').pop();
            if (fileName.match(regex) && isToRuleApplicable(rule, fileType)) {
              if (plugin.getSettings().iconInTabsEnabled && fileType === 'file') {
                // iconTabs.add(plugin, openFiles[path], { iconName: rule.icon });
              }

              const titleEl = fileItem.titleEl;
              const titleInnerEl = fileItem.titleInnerEl;
              const existingIcon = titleEl.querySelector('.obsidian-icon-folder-icon');
              if (!existingIcon) {
                const iconNode = titleEl.createDiv();
                iconNode.classList.add('obsidian-icon-folder-icon');

                dom.setIconForNode(plugin, rule.icon, iconNode);

                titleEl.insertBefore(iconNode, titleInnerEl);
              }
            }
          }
        });
      });
    }
  } catch {
    // Rule is not applicable to a regex format.
    if (file) {
      const fileType = (await plugin.app.vault.adapter.stat(file.path)).type;
      if (file.name.includes(rule.rule) && isToRuleApplicable(rule, fileType)) {
        if (plugin.getSettings().iconInTabsEnabled && fileType === 'file') {
          // iconTabs.add(plugin, file as TFile, { iconName: rule.icon });
        }

        dom.createIconNode(plugin, file.path, rule.icon, rule.color);
      }
    } else {
      plugin.app.vault.getAllLoadedFiles().forEach(async (file) => {
        const fileType = (await plugin.app.vault.adapter.stat(file.path)).type;
        if (file.name.includes(rule.rule) && isToRuleApplicable(rule, fileType)) {
          if (plugin.getSettings().iconInTabsEnabled && fileType === 'file') {
            // iconTabs.add(plugin, file as TFile, { iconName: rule.icon });
          }

          dom.createIconNode(plugin, file.path, rule.icon, rule.color);
        }
      });
    }
  }
};

export const getIconsInData = (plugin: IconFolderPlugin): string[] => {
  const result: string[] = [];

  Object.entries(plugin.getData()).forEach(([key, value]) => {
    if (key === 'settings') {
      const rules = (value as IconFolderSettings).rules;
      rules.forEach((rule: CustomRule) => {
        if (!emoji.isEmoji(rule.icon)) {
          result.push(rule.icon);
        }
      });
    } else if (key !== 'settings' && key !== 'migrated') {
      if (typeof value === 'string' && !emoji.isEmoji(value)) {
        result.push(value);
      } else if (typeof value === 'object') {
        const v = value as FolderIconObject;
        if (v.iconName !== null && !emoji.isEmoji(v.iconName)) {
          result.push(v.iconName);
        }
        if (v.inheritanceIcon !== null && !emoji.isEmoji(v.inheritanceIcon)) {
          result.push(v.inheritanceIcon);
        }
      }
    }
  });

  return result;
};

export const readFileSync = async (file: File): Promise<string> => {
  const content = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.readAsText(file, 'UTF-8');
    reader.onload = (readerEvent) => resolve(readerEvent.target.result as string);
  });

  return content;
};
