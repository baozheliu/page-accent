# Page Accent Privacy Policy

Last updated: July 11, 2026

Page Accent is a browser extension that adds a color line to websites. Page Accent's single purpose is to help users mark matching websites with a color line so they can tell pages apart at a glance.

## Data We Process

Page Accent processes and stores the following data locally in the user's browser:

- Extension preferences, such as theme, line position, line width, badge display, and tab group sync settings.
- User-created color marks, including the marked page URL, page title, color, and related status.
- User-created local matching rules, such as website domains, path keywords, or URL patterns.
- The current page URL and title, used to display color marks and match local rules.

This data is used to restore user preferences and color marks after page refreshes, tab changes, or browser restarts.

## Data Storage and Transfer

Page Accent does not provide an account system or remote sync service. The data listed above is stored by default in the user's own browser local storage.

Page Accent does not upload users' mark data, browsing records, page titles, URLs, rules, or settings to a developer server. Page Accent does not sell user data and does not transfer user data to third parties for advertising, profiling, credit evaluation, or any purpose unrelated to the extension's single purpose.

## Permission Usage

Page Accent requests only the permissions necessary to provide website color-line marking:

- `activeTab`: Used after the user opens the popup, uses a shortcut, or selects a context menu action to read the current active tab information and apply the user-selected color mark.
- `storage`: Used to store extension settings, color marks, and matching rules locally in the browser.
- `tabs`: Used to query and listen for tab activation and updates, and to open a marked page when the user selects it from the side panel.
- `contextMenus`: Used to provide user-initiated right-click menu actions for setting a color, removing a mark, and creating a rule.
- `sidePanel`: Used to provide the side panel interface for reviewing current page status, saved page marks, and local rules.
- `tabGroups`: Used, when the user enables tab group sync, to read browser tab group colors and apply the matching group color to tabs that do not have their own mark.
- Host permissions: Used to run packaged content scripts on http and https pages visited by the user so Page Accent can display the local color line and badge and match the current page URL and title against local rules.

Page Accent does not use remote JavaScript or remote Wasm. All scripts and resources are included in the extension package.

## Data Retention and Deletion

Page Accent data is stored locally in the user's browser. Users can clear related data through the extension settings, the browser extension management page, or the browser's site/extension data management features. When Page Accent is uninstalled, the browser generally removes the local data stored by the extension.

## Children's Privacy

Page Accent is intended for general users. It does not intentionally collect children's personally identifiable information, health information, financial information, authentication information, personal communications, precise location, or website body content.

## Policy Changes

If Page Accent's data processing practices materially change, this privacy policy will be updated and the latest version will be made available on the extension store listing or the corresponding public page.

## Contact

For questions about this privacy policy or Page Accent's data processing practices, please contact the developer through the support channel provided on the extension store listing or the project repository Issues: https://github.com/baozheliu/page-accent/issues
