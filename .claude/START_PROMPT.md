TASKS
1. Read the users CLAUDE.md in home directory. Follow its instructions at all times!
3. Read this projects documentation - README.md
4. Read the developement guidelines /docs/DEVELOPMENT.md
5. Read the makefile and use its commands from project root!

RULES
1. NO BACKWARDS COMPATIBILITY NEEDED!
2. DO NOT USE TIMEOUTS!
3. USE THE CODE-INDEX MCP
4. DELEGATE TASKS TO EXPERT AGENTS WHEN NEEDED
5. IF IN DOUBT, ASK RELEVANT QUESTIONS TO USER
6. DO NOT COMMIT ANY CODE
7. USE SVELTE 5 SYNTAX!

TOOLS
1. Use `make verify` to validate code changes
2. Use `make test` to run unit tests
3. To run e2e tests use `nvm use 22.12.0 && make e2e`
4. To run any npm related command, eg `make test` you need to run `nvm use 22.12.0` in the same terminal session. Always change the node version!
5. Use github mcp to read pr comments
6. use playwright mcp to debug tests