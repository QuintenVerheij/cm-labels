# Shipping methods for a seller in Germany

Collected 2026-09-29 from public pages only (no German seller account was available). Every fact is
marked **verified** (with its source) or **unverified** (with the reason). `shipping-costs/Germany.txt`
is the view from the Netherlands to Germany and was not used.

## Sources

| Id | Source |
|---|---|
| CM-API | `https://help.cardmarket.com/api/shippingCosts?locale=en&fromCountry=7&toCountry=<id>`: the JSON behind the calculator on `https://help.cardmarket.com/en/ShippingCosts`. Germany is id 7; the ids come from `https://help.cardmarket.com/api/countries?page=0&limit=50&locale=en`. Fetched for all 34 destinations. The same endpoint with `fromCountry=23&toCountry=7` returns exactly the rows of `shipping-costs/Germany.txt`, so it is the source of the existing NL data. |
| CM-HELP | `https://help.cardmarket.com/en/ShippingCosts` (article text) |
| CM-FAQ | `https://help.cardmarket.com/en/SellingShipmentsFAQ` |
| DHL-NAT | `https://www.dhl.de/de/privatkunden/pakete-versenden/deutschlandweit-versenden/preise-national.html` |
| DHL-INT | `https://www.dhl.de/de/privatkunden/pakete-versenden/weltweit-versenden/preise-international.html` |
| DP-PDF | `https://www.deutschepost.de/dam/jcr:917c5c99-78af-48c5-835d-acc6b9e0929a/dp-preisblatt-012026.pdf` (counter price sheet, "Stand: 01.01.2026") |
| DP-EINSCHR | `https://www.deutschepost.de/de/e/einschreiben.html` |
| IM-INFO | `https://shop.deutschepost.de/informationen-zur-internetmarke` |
| SHOP-FAQ | `https://shop.deutschepost.de/shop/infocenter/faq.jsp` |
| SHOP-PAY | `https://shop.deutschepost.de/shop/infocenter/zahlungsinformationen.jsp` |
| OFI | `https://www.dhl.de/de/privatkunden/pakete-versenden/online-frankieren.html` and `.../online-frankieren/so-funktioniert-es.html` |

## Rules that apply to every method

- **Verified (CM-HELP):** registered (tracked) shipping is mandatory for any shipment worth more than
  25,00 €, for some shipments over 10,00 € from a new seller, for some shipments from a seller with
  "too many" shipments in transit, and for any shipment from a seller with a loss rate above 2 %.
  Every untracked method below has a max. value of 25,00 €, which matches this rule.
- **Verified (CM-API):** the method names are the same for `locale=en`, `locale=de` and `locale=fr`
  (all 34 destinations from Germany compared byte for byte, and NL to NL and NL to DE as well).
- **Verified (CM-API):** "Price" = "Stamp price" + Cardmarket's packaging fee: +0,30 € for letters,
  +0,50 € for letters over 100 g and registered letters, +1,00 € for parcels (derived from every row;
  CM-HELP names the three fee classes).
- **Unverified: which methods are required and which are optional for the seller.** No public page
  says whether a German seller can switch any of these methods off. It needs a logged-in German seller
  account (the shipping settings of the account). Until then, treat every method below as one a buyer
  can pick.

## Domestic: Germany to Germany (verified, CM-API)

Names exactly as Cardmarket writes them (note `Grossbrief` with "ss", and `EINWURF` in capitals).

| Method (exact name) | Max. weight | Max. value | Tracked | Stamp price | Price | Carrier product (price check) |
|---|---|---|---|---|---|---|
| `Standardbrief` | 20 g | 25,00 € | no | 0,95 € | 1,25 € | Deutsche Post Standardbrief, 0,95 € (DP-PDF) |
| `Kompaktbrief` | 50 g | 25,00 € | no | 1,10 € | 1,40 € | Kompaktbrief, 1,10 € (DP-PDF) |
| `Grossbrief` | 500 g | 25,00 € | no | 1,80 € | 2,30 € | Großbrief, 1,80 € (DP-PDF) |
| `Maxibrief` | 1000 g | 25,00 € | no | 2,90 € | 3,40 € | Maxibrief, 2,90 € (DP-PDF) |
| `Kompaktbrief + Einschreiben EINWURF` | 50 g | 100,00 € | yes | 3,45 € | 3,95 € | Kompaktbrief 1,10 + Einschreiben Einwurf 2,35 (DHL-NAT) |
| `Grossbrief + Einschreiben EINWURF` | 500 g | 100,00 € | yes | 4,15 € | 4,65 € | Großbrief 1,80 + Einschreiben Einwurf 2,35 (DHL-NAT) |
| `DHL Päckchen S` | 2000 g | 25,00 € | no | 4,19 € | 5,19 € | DHL Päckchen S bis 2 kg, 4,19 € (DHL-NAT) |
| `DHL Päckchen M` | 2000 g | 25,00 € | no | 5,19 € | 6,19 € | DHL Päckchen M bis 2 kg, 5,19 € (DHL-NAT) |
| `DHL Paket (Online)` | 2000 g | 500,00 € | yes | 6,19 € | 7,19 € | DHL Paket 2 kg, 6,19 €, "nur online" (DHL-NAT) |
| `DHL Paket` | 5000 g | 500,00 € | yes | 7,69 € | 8,69 € | DHL Paket 5 kg, 7,69 € (DHL-NAT) |
| `DHL Paket` | 10000 g | 500,00 € | yes | 10,49 € | 11,49 € | DHL Paket 10 kg, 10,49 € (DHL-NAT) |
| `DHL Paket (Online) Versicherung bis 2.500€` | 2000 g | 2.500,00 € | yes | 13,18 € | 14,18 € | Paket 2 kg 6,19 + Transportversicherung bis 2.500 EUR 6,99 (DHL-NAT) |
| `DHL Paket Versicherung bis 2.500€` | 5000 g | 2.500,00 € | yes | 14,68 € | 15,68 € | 7,69 + 6,99 (DHL-NAT) |
| `DHL Paket Versicherung bis 2.500€` | 10000 g | 2.500,00 € | yes | 17,48 € | 18,48 € | 10,49 + 6,99 (DHL-NAT) |
| `DHL Paket Versicherung bis 2.500€` | 31500 g | 2.500,00 € | yes | 30,98 € | 31,98 € | Paket 31,5 kg 23,99 + 6,99 (DHL-NAT) |
| `SHIPPING COST ESTIMATION for Courier Parcel with Full Insurance` | 20000 g | 2.500 € to 1.000.000 € (9 rows) | yes | 99,00 € to 20.049,00 € | 100,00 € to 20.050,00 € | none: the seller finds a courier (CM-FAQ) |
| `Virtual Delivery` | 0 g | 10.000,00 € | yes | 0,00 € | 0,00 € | none: nothing is shipped |

Notes:

- **Verified (DHL-NAT):** DHL now sells Päckchen S and M with "Sendungsverfolgung" and "Haftung bis
  500 EUR", but Cardmarket lists both as untracked with a 25 € limit. The sale page's tracked flag, not
  the carrier's, decides how the extension treats them.
- **Verified (DHL-NAT):** Einschreiben Einwurf is liable up to 20 EUR, while Cardmarket allows 100 € on
  the two Einschreiben methods.
- **Verified (CM-API):** `Virtual Delivery` is offered from Germany (to all 34 destinations) but not
  from the Netherlands.

## International: Germany to other countries (verified, CM-API)

Where the price differs by destination, the groups are listed. "EU-26" = the 26 EU countries other than
Germany in Cardmarket's list.

| Method (exact name) | Max. weight | Max. value | Tracked | Destinations | Stamp price / Price | Carrier product (price check) |
|---|---|---|---|---|---|---|
| `Letter (Standardbrief)` | 20 g | 25,00 € | no | all except DE, JP, SG (31) | 1,25 € / 1,55 € | Standardbrief International, 1,25 € (DP-PDF) |
| `Small Parcel (Päckchen XS)` | 2000 g | 25,00 € | no | EU-26 | 6,99 € / 7,99 € | Päckchen XS bis 2 kg, Zone 1, 6,99 €, "nur online" (DHL-INT) |
| `Small Parcel (Päckchen M)` | 2000 g | 25,00 € | no | EU-26 | 10,49 € / 11,49 € | Päckchen M bis 2 kg, Zone 1, online 10,49 € (counter 11,99 €) (DHL-INT) |
| `Parcel (DHL Päckchen M Online)` | 2000 g | 25,00 € | no | IS, LI, NO | 18,49 € / 19,49 € | Päckchen M, Zone 3, online 18,49 € (DHL-INT) |
| `Registered Parcel (DHL Paket Online)` | 2000 g | 500,00 € | yes | EU-26 | 14,49 € / 15,49 € | Paket bis 2 kg, Zone 1, "nur online" (DHL-INT) |
| `Registered Parcel (DHL Paket Online)` | 5000 / 10000 / 20000 / 30000 g | 500,00 € | yes | EU-26; CH, GB | EU: 17,49 / 22,49 / 28,49 / 45,49 €; CH, GB: 26,99 / 34,99 / 48,99 / 62,99 € (price +1,00 €) | Paket, Zone 1 and Zone 2 online prices (DHL-INT) |
| `Registered Parcel (DHL Paket Welt Online)` | 5000 / 10000 / 20000 / 30000 g | 500,00 € | yes | IS, LI, NO | 29,99 / 37,99 / 52,99 / 67,99 € (price +1,00 €) | Paket, Zone 3 online prices (DHL-INT) |
| `Insured Parcel (DHL Wertpaket 1.000€)` | 5000 / 10000 / 20000 / 30000 g | 1.000,00 € | yes | all except DE, JP, SG (31) | EU: 31,49 / 36,49 / 42,49 / 59,49 €; CH, GB: 40,99 / 48,99 / 62,99 / 76,99 €; IS, LI, NO: 43,99 / 51,99 / 66,99 / 81,99 € (price +1,00 €) | Paket online price + "Höherversicherung International ab + 14,00" (DHL-INT) |
| `Insured Parcel (DHL Wertpaket 2.000€)` | 5000 / 10000 / 20000 / 30000 g | 2.000,00 € | yes | all except DE, JP, SG (31) | EU: 45,49 / 50,49 / 56,49 / 73,49 €; CH, GB: 54,99 / 62,99 / 76,99 / 90,99 €; IS, LI, NO: 57,99 / 65,99 / 80,99 / 95,99 € (price +1,00 €) | Paket + 28,00 €. **Unverified:** DHL-INT only says "ab + 14,00"; the 2.000 € step is not listed. |
| `DHL Express` | 500 / 1000 / 2000 / 5000 g | 500,00 € | yes | EU-26 except CY (25) | 4 price groups, e.g. AT/DK/FR 55,30 / 61,00 / 67,60 / 81,80 € | DHL ExpressEasy International. **Unverified:** Cardmarket's price groups (BE/LU/NL, AT/DK/FR, CZ/IT/PL/ES, 15 others) do not match DHL's current zones (DHL-INT has DK, FR, MC, PL in "Zone 2 - EU" at 60,60 € online for 0,5 kg). |
| `DHL Express Insurance 1.500 €` | 500 / 1000 / 2000 / 5000 g | 1.500,00 € | yes | same 25 | 67,00 € to 125,60 € | as above, with insurance |
| `DHL Express Insurance 2.500 €` | 500 / 1000 / 2000 / 5000 g | 2.500,00 € | yes | same 25 | 77,00 € to 135,60 € | as above |
| `DHL Express Insurance 5.000 €` | 500 / 1000 / 2000 / 5000 g | 5.000,00 € | yes | same 25 | 107,50 € to 160,60 € | as above |
| `SHIPPING COST ESTIMATION for Courier Parcel with Full Insurance` | 20000 g | 2.500 € to 1.000.000 € | yes | all except JP, SG | 99,00 € to 20.049,00 € | none (CM-FAQ) |
| `Virtual Delivery` | 0 g | 10.000,00 € | yes | all 34 | 0,00 € | none |

Notes:

- **Verified (CM-API):** Japan and Singapore get only `Virtual Delivery` from Germany.
- **Verified (CM-API):** the international letter is 20 g only. There is no international Kompaktbrief,
  Großbrief, Maxibrief or international Einschreiben method, so every tracked international sale is a
  DHL parcel or DHL Express.
- **Verified (CM-API):** the key `Letter` in `methods.psd1` does not match the German origin, where the
  international letter is `Letter (Standardbrief)`.
- **Verified (DHL-INT):** the "online" parcel prices Cardmarket uses are lower than the counter prices,
  so these labels must be bought online to cost what the buyer paid.

To rebuild these tables for another origin: call CM-API with that origin's id and every destination id.
Each row has `name`, `isTracked`, `maxValue`, `maxWeight`, `stampPrice`, `price`, `isLetter`, `isVirtual`.
The names contain HTML entities (`&amp;`), so decode them before comparing.

## Which web shop can print or prepare each method

| Method | Shop | Login wall | Cookie wall and bot protection | Automation |
|---|---|---|---|---|
| `Standardbrief`, `Kompaktbrief`, `Grossbrief`, `Maxibrief`, `Letter (Standardbrief)` | **Internetmarke**, now inside the Deutsche Post shop: `https://internetmarke.deutschepost.de/` redirects to `https://shop.deutschepost.de/` (verified, HTTP redirect). IM-INFO (verified): prints "Postkarten und Briefe national / international" as a PDF, on labels or plain paper, up to 999 marks per cart, optionally with sender and recipient address on the mark. | **Unverified** whether a guest can buy. SHOP-PAY (verified): payment by PayPal, Portokasse (needs a registration and a login, minimum top-up 10 €) and other shop methods; IM-INFO (verified): "abhängig vom Status Ihrer Registrierung ... möglicherweise nicht alle Zahlarten". | Verified: OneTrust consent script on the page; Akamai Bot Manager cookies (`_abck`, `bm_sz`) set on `shop.deutschepost.de`. | Server-rendered shop (Apache, `EFISESSIONID` session cookie, verified). Public deep links exist (`/shop/deeplink/internetmarke?pplId=290`, `/standardbrief-internetmarke`, `/kompaktbrief-internetmarke`, `/grossbrief-internetmarke`, verified in the page's links); the configurator itself was not inspected (unverified). |
| `Kompaktbrief + Einschreiben EINWURF`, `Grossbrief + Einschreiben EINWURF` | **Internetmarke** with Einschreiben Einwurf: DP-EINSCHR (verified) offers "Einwurf ... Marke online kaufen und ausdrucken"; IM-INFO (verified) lists "Einschreiben national und international" and says they can go in any post box. The shop has a page `/einschreiben-internetmarke` (verified). | as above | as above | as above; the Einwurf option's place in the configurator is unverified. |
| `DHL Päckchen S`, `DHL Päckchen M`, `DHL Paket (Online)`, `DHL Paket` | **DHL Online Frankierung** (OFI). | Verified: no account needed ("Keine Registrierung notwendig", SHOP-FAQ; OFI explains buying "ohne Kundenkonto/nicht eingeloggt"). | Verified: OneTrust; Akamai Bot Manager cookies (`_abck`, `bm_sz`) set on `www.dhl.de`. | Verified: a single-page app mounted at `#ofi-app`. The page's schema.org data publishes deep links that put an item in the cart: `https://www.dhl.de/int-versenden/gw/rest/init?domain=de&force=true&shoppingcart.items.0.product.id=PAK02&shoppingcart.items.0.type=ShipmentItem&shoppingcart.items.0.address.receiver.country=AUT` (one request on 2026-09-29 answered 302 to the product selection and set an `ofiMagicSession` cookie). Product ids seen: `PAK02`, `PAK05`; ids for Päckchen and the other weights are unverified. The prices in that schema data are out of date (13,99 € for Paket 2 kg to AT against 14,49 € on DHL-INT), so read prices from the app, not from the schema. OFI (verified): cart, then e-mail and payment, then the label as a download and by e-mail; a label that was not printed or downloaded can be cancelled within 14 days. |
| `DHL Paket (Online) Versicherung bis 2.500€`, `DHL Paket Versicherung bis 2.500€` | DHL Online Frankierung with "Transportversicherung bis 2.500 EUR". **Unverified** that this service can be added online: DHL-NAT lists it without the "nur online" or "nur in der Filiale" marks. | as above | as above | as above |
| `Small Parcel (Päckchen XS)`, `Small Parcel (Päckchen M)`, `Parcel (DHL Päckchen M Online)`, `Registered Parcel (DHL Paket Online)`, `Registered Parcel (DHL Paket Welt Online)` | **DHL Online Frankierung**; Päckchen XS and Paket 2 kg are "nur online" (DHL-INT, verified). | as above | as above | as above; outside the EU (CH, GB, IS, LI, NO) the label needs customs data (DHL-INT, "Informationen zum Zoll"). |
| `Insured Parcel (DHL Wertpaket 1.000€)`, `Insured Parcel (DHL Wertpaket 2.000€)` | DHL parcel with "Höherversicherung International". **Unverified** whether it can be booked online or only at a post office. | as above | as above | unverified |
| `DHL Express`, `DHL Express Insurance ...` | DHL Express International. Verified (DHL-INT): online prices exist next to "Filialpreis", and a pickup "kann nur direkt bei Sendungserstellung in der Online Frankierung beauftragt werden", so Express shipments are created in the Online Frankierung. | as above | as above | unverified; rare and expensive, keep it manual. |
| `SHIPPING COST ESTIMATION ...`, `Virtual Delivery` | none | - | - | manual / nothing to ship |

Official APIs exist for business use (a Deutsche Post page on the Internetmarke API connection, and the
DHL business customer portal, both linked from the pages above); whether a private seller can use them
was not checked (unverified), and a browser extension would not use them.

## Which shop to automate first

**Internetmarke on `shop.deutschepost.de`.**

- It covers every letter method: the four untracked domestic letters (up to 1000 g, 25 €), both
  domestic Einschreiben methods (up to 500 g, 100 €) and the international letter (20 g, 25 €)
  (verified from the tables above). Only Päckchen, parcels and Express need DHL. The letters are the
  methods the extension already treats as "stamp" sales for the Netherlands.
- Its prices are exactly Cardmarket's stamp prices (verified above), so nothing is overpaid.
- It can print the recipient address on the mark and delivers a PDF (verified, IM-INFO), which fits the
  extension's existing label printing better than a separate label per parcel.
- The shop is server-rendered and has public deep links to the letter products (verified), a steadier
  target than a single-page app.

Risks: guest checkout is unverified (a Portokasse login may be needed), the configurator was not
inspected, and Akamai Bot Manager is active, so the automation must run in the user's own logged-in
browser tab (as the PostNL cart does today), never from background `fetch()` calls.

**DHL Online Frankierung comes second.** Every tracked international sale, every domestic sale above
100 € or 500 g tracked, and every Päckchen is DHL, so the extension needs it too. It is a JS single-page app behind Akamai, but it
needs no account and has a published cart deep link (product id + destination country) that removes the
product-picking step. Automate it after Internetmarke works.
