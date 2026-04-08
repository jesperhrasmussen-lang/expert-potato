Refresh the offer database from all supermarket sources and restart the API server.

Steps:
1. Run: `PYTHONPATH=/root/expert-potato/scripts python3 /root/expert-potato/scripts/refresh_offer_db_dk.py /root/expert-potato/projects/nearby-offers-webapp/data/nearby-offers.db --pretty`
2. Show the summary (direct/fallback/merged counts, chain count)
3. Run: `sqlite3 /root/expert-potato/projects/nearby-offers-webapp/data/nearby-offers.db "SELECT chain_key, COUNT(*) as tilbud FROM offers WHERE offer_state='active' GROUP BY chain_key ORDER BY chain_key;"`
4. Restart API: `systemctl restart nearby-meals-api`
5. Verify: `curl -s http://localhost:8081/health`
6. Report total active offers per chain
