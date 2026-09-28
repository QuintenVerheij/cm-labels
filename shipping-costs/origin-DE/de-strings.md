# English texts the extension reads, and their German form on cardmarket.com/de/

Collected 2026-09-29. Each entry is **verified** (source given) or **unverified** (reason given).

Why most entries are unverified: the sale page, the sales list and the logged-in header exist only for a
logged-in seller, and no German seller account was available. `www.cardmarket.com` answers plain HTTP
clients with a Cloudflare challenge (HTTP 403, "Just a moment...") and headless Chrome with a block page,
so not even the public `/de/` pages could be read. No German text below was guessed; where the German
text is unknown, the entry says so.

Evidence that the interface texts **are** translated on `/de/` (verified): the help centre quotes button
labels in both languages. `https://help.cardmarket.com/en/cancelling-orders-on-cardmarket` quotes
"commit to buy" and "don't cancel anymore"; `https://help.cardmarket.com/de/cancelling-orders-on-cardmarket`
quotes "Zum Kauf bestätigen" and "Nicht mehr stornieren" for the same buttons. So every English label
below should be expected to change on `/de/` until a German page shows otherwise.

## extension/content/cm.js

| Line | English text read today | German text on /de/ | Status |
|---|---|---|---|
| 14 | Block page: `Attention Required`, `Sorry, you have been blocked`, `Access denied`, `Error 10\d\d`; markup `#cf-wrapper`, `#cf-error-details` | **Same** for the block page: Chrome started with `--lang=de-DE` on `https://www.cardmarket.com/de/Magic` got `<html lang="en-US">`, title "Attention Required! \| Cloudflare", text "Sorry, you have been blocked", and both `#cf-wrapper` and `#cf-error-details`. | Verified (one request, 2026-09-29). Only this block page variant was seen. |
| 14 | Rate limit: `Too Many Requests`, `Error 429`, `HTTP ERROR 429` | unknown | Unverified: no rate-limit page was seen. |
| 15 | Challenge: `Just a moment`, `Performing security verification`, `Verify you are human`; markup `#challenge-form`, `#challenge-running`, `#challenge-stage`, `[id^="cf-chl"]`, `script[src*="/cdn-cgi/challenge-platform"]` | The challenge HTML as served is English for a German request: with `Accept-Language: de-DE` the response was `<html lang="en-US">`, title "Just a moment...". The text the challenge script writes after it runs in a German browser is unknown. | Served HTML verified (curl, 2026-09-29); rendered German text unverified (the script only runs in a real browser). |
| 15 | (markup note) | The served challenge page has none of `#challenge-form`, `#challenge-running`, `#challenge-stage` or an `id` starting with `cf-chl`. It has `#challenge-error-text` (inside `<noscript>`) and an inline script that sets `window._cf_chl_opt` and loads `/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1`; that script element exists only after the inline script has run. | Verified (same response). |
| 23 | `Page \d+ of (\d+)` (sales list) | unknown | Unverified: logged-in page. |
| 35-36 | `Shipping Method` (the `dt` text, `Shipping Method:` with the colon removed) | unknown | Unverified: logged-in page. The English form is verified in a saved order page on GitHub (see Paths). |
| 40 | `max. N g` (muted span after the method name) | unknown; the number format may also change (`1.000` vs `1,000`; the regex already accepts both). | Unverified: logged-in page. |
| 43 | `/mail/i` (the `dt` whose text contains "mail") | unknown | Unverified: logged-in page. |
| 49 | `No tracking` | unknown | Unverified: logged-in page. |
| 49 | `Tracking Code` | unknown. The German help centre uses both "Sendungsnummer" and "Tracking-Code" in running text (`https://help.cardmarket.com/de/postal-investigations`, `https://help.cardmarket.com/de/buyer-hasnt-confirmed-arrival`), so it does not settle the label. | Unverified: logged-in page. |
| 50 | `Phone Number` | unknown | Unverified: logged-in page. |
| 55 | `Sale #` | unknown | Unverified: logged-in page. |

## Country names (the sale-to-country lookup `cfg.byName[s.country]`, built from `data/countries.json` entry `[0]`)

The German names Cardmarket's own help centre uses (verified:
`https://help.cardmarket.com/api/countries?page=0&limit=50&locale=de` against `locale=en`, matched by
Cardmarket's country id). **Unverified** whether the address block on a `/de/` sale page prints the
country in German at all, and if so whether it uses these names: logged-in page.

| English | German (help centre) |
|---|---|
| Austria | Österreich |
| Belgium | Belgien |
| Bulgaria | Bulgarien |
| Croatia | Kroatien |
| Cyprus | Zypern |
| Czech Republic | Tschechien |
| Denmark | Dänemark |
| Estonia | Estland |
| Finland | Finnland |
| France | Frankreich |
| Germany | Deutschland |
| Greece | Griechenland |
| Hungary | Ungarn |
| Iceland | Island |
| Ireland | Irland |
| Italy | Italien |
| Japan | Japan (same) |
| Latvia | Lettland |
| Liechtenstein | Liechtenstein (same) |
| Lithuania | Litauen |
| Luxembourg | Luxemburg |
| Malta | Malta (same) |
| Netherlands | Niederlande |
| Norway | Norwegen |
| Poland | Polen |
| Portugal | Portugal (same) |
| Romania | Rumänien |
| Singapore | Singapur |
| Slovakia | Slowakei |
| Slovenia | Slowenien |
| Spain | Spanien |
| Sweden | Schweden |
| Switzerland | Schweiz |
| United Kingdom | Großbritannien |

## Shipping method names (`data/methods.json` keys)

**Same** in Cardmarket's data: `https://help.cardmarket.com/api/shippingCosts` returns identical method
names for `locale=en`, `locale=de` and `locale=fr` (verified for Germany to all 34 destinations, and for
Netherlands to Germany and Netherlands to Netherlands). The names are carrier names, partly German
already (`Grossbrief + Einschreiben EINWURF`, `Small Parcel (Päckchen XS)`). **Unverified** that the
`/de/` sale page prints the stored name unchanged: logged-in page.

## extension/lib/panel-app.js

| Line | English text read today | German text on /de/ | Status |
|---|---|---|---|
| 74 | `search in my shipments` \| `confirm shipment` (button labels the panel copies its style from) | unknown | Unverified: logged-in pages. |
| 236 | `Page \d+ of` | unknown (same text as cm.js line 23) | Unverified: logged-in page. |
| 243 | `/en/Magic` (the "English pages only" message; the check itself is `BASE` in `extension/lib/cardmarket.js`) | The German prefix is `/de/Magic`: see Paths. | Verified. |

## Paths

| Path | /de/ form | Status |
|---|---|---|
| `/en/Magic/Orders/<id>` (sale page) | `/de/Magic/Orders/<id>`: only the language segment changes. | Verified: the language switcher of a saved Cardmarket order page links `https://www.cardmarket.com/de/Magic/Orders/1111111111` (`https://raw.githubusercontent.com/Mathogrammer/cardmarket2collection-extension/HEAD/test/SamplePurchaseCardmarket.htm`, an English page saved in 2024; also links `/es/`, `/fr/`, `/it/`). |
| `User_Logout` | Probably `/de/Magic/PostGetAction/User_Logout`; the selector `a[href*="User_Logout"]` matches it either way if the action name is not translated. | The English form `/en/Magic/PostGetAction/User_Logout` is verified in the same saved page; the `/de/` form is unverified (logged-in page). |
| `/Orders/Sales/Paid?presaleStatus=2` | unknown; expected `/de/Magic/Orders/Sales/Paid?presaleStatus=2` since the order page path is not translated | Unverified: logged-in page. |
| `site=<n>` (page parameter) | unknown | Unverified: logged-in page. |

Public `/de/` URLs indexed by search engines use English path segments (for example
`https://www.cardmarket.com/de/Help/FAQ`), which agrees with the path rows above but does not verify them.

## What a German seller page would settle

One saved `/de/` sales list page and one saved `/de/` sale page (buyer data removed), plus one
challenge page rendered in a German browser, answer every unverified row above.
