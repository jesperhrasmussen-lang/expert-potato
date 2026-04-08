Run a meal search against the VPS API and show results as the user would see them.

Use address from argument, or default to "Tingvej 4A, 2300 København S" if none given.

Steps:
1. Run: `curl -s -X POST http://localhost:8081/api/meal-search -H "Content-Type: application/json" -d '{"address":"$ARGUMENTS"}'`
   (use default address if $ARGUMENTS is empty)
2. Parse the JSON response and show:
   - Resolved address
   - Number of offers and places found
   - For each meat family with an active offer: show the cheapest option with chain, price, package size, distance
3. Format output like the frontend result cards:
   ```
   1. Kyllingefilet · 20kr / 400g
      Rema 1000 · 112m · 2 måltider · ~10kr/måltid

   2. Hakket oksekød · 29kr / 400g
      Lidl · 210m · 2 måltider · ~15kr/måltid
   ```
4. If the API is unreachable, report that clearly
