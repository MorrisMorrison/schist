This document is a list of features we want to build.

# Feature 1 - Connection to GitHub Repository
We already version our documents internally using git. The goal of this feature is to integrate with github, to allow pushing all our documents to github as a backup mechanism.

# Feature 2 - OIDC Integration
We want to allow setting schist up as a oidc client, so users can use their oidc provider to authenticate this app. Our main goal is to use pocket-id as a oidc provider for now.

# Feature 3 - Security check
Execute a security check. Make sure all inputs are sanitized, we are protected against any form of xss, file system traversal is not possible, etc.

# Feature 4 - Backup mechanism
Investigate possible backup mechanism for our users.
We could use Feature 1 and simply integrate with github.
Please outline other approaches we could take. the goal is to keep it simple
