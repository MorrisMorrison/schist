This document is a list of features we want to build.

# Feature 1 - Import Functionality
We want to allow importing markdown documents in multiple ways.
We want to add 2 major ways:
1. Import button at the bottom of our sidebar
The import button should open a import modal
Via the modal you should be able to select a file or complete folder containing md documents.
You should also be able to select the target path where you want to import to.
We want to support plain md files, and especially obsidian md files (not sure if they have specific meta data we need to adjust)

# Feature 2 - Export Functionality 
We want to  allow exporting documents in multiple ways
1. Download a single document
2. Download a complete folder including all its content
3. Download all files, as plain root folder with contents

We want to add the following ways to do that:
1. Context menu entry in foldertree in our sidebar. Entry should be called export. the entry should exist in root folder, folder, and file context menu


# Feature 3 - Connection to GitHub Repository
We already version our documents internally using git. The goal of this feature is to integrate with github, to allow pushing all our documents to github as a backup mechanism.

# Feature 4 - Editor in Fullscreen mode
We want to allow editing documents in a fullscreen mode.
We probably want to add a full screen button that opens the editor in full screen mode.

# Feature 5 - OIDC Integration
We want to allow setting schist up as a oidc client, so users can use their oidc provider to authenticate this app. Our main goal is to use pocket-id as a oidc provider for now.