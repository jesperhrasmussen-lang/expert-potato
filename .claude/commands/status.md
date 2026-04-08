Check the health of all system components and report status.

Steps:
1. API server: `systemctl status nearby-meals-api | head -5` and `curl -s http://localhost:8081/health`
2. DB offers: `sqlite3 /root/expert-potato/projects/nearby-offers-webapp/data/nearby-offers.db "SELECT offer_state, COUNT(*) FROM offers GROUP BY offer_state;"`
3. Cron: `crontab -l`
4. Latest Vercel deployment: use `mcp__claude_ai_Vercel__list_deployments` with projectId `prj_gbOUTMnhwhPsfLirLrze7HTX5fQW` and teamId `team_c6obpwzZ2O2yRaWWce3Mitow`, show state of the latest
5. Git status: `git status --short` and `git log --oneline -3`

Report a clean summary table of all components.
