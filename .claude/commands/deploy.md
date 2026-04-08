Build the Next.js frontend, commit all changes, push to GitHub, and check Vercel deployment status.

Steps:
1. Run `npm run build` in `projects/nearby-offers-webapp/web/` — stop if build fails
2. Run `git status` to see what changed
3. Stage all modified/new files (but NOT .env, credentials, or node_modules)
4. Create a commit with a concise message describing the changes
5. Push to origin main
6. Wait 30 seconds, then check the latest Vercel deployment status using `mcp__claude_ai_Vercel__list_deployments` with projectId `prj_gbOUTMnhwhPsfLirLrze7HTX5fQW` and teamId `team_c6obpwzZ2O2yRaWWce3Mitow`
7. Report: deployment state (READY/ERROR/BUILDING), URL, and if ERROR show build logs
