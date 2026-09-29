// A mixed run of NL sales for the planner: stamps of both weights, domestic and abroad, tracked labels in and
// outside NL, and every reason a sale is left for buying by hand.
const addr = (name, street, city, country, extras = []) => [
  { kind: 'Name', text: name }, ...extras.map(text => ({ kind: 'Extra', text })), { kind: 'Street', text: street }, { kind: 'City', text: city }, { kind: 'Country', text: country },
];
const sale = (id, methodName, grams, tracked, value, lines, more = {}) => ({ id, methodName, method: `${methodName} max. ${grams} g`, grams, tracked, value, email: 'buyer@example.com', phone: '', lines, ...more });

export const sales = [
  sale('1001', 'Letter', 20, false, 4.5, addr('Anna Schmidt', 'Hauptstraße 12', '10623 Berlin', 'Germany')),
  sale('1002', 'Letter', 50, false, 12, addr('Bernd Müller', 'Bahnhofstr. 3', '80331 München', 'Germany', ['c/o Weber'])),
  sale('1003', 'Standard Letter', 20, false, 2, addr('Cees de Vries', 'Kerkstraat 12A', '1234AB Utrecht', 'Netherlands')),
  sale('1004', 'Brief', 20, false, 1.25, addr('Dirk Bakker', 'Dorpsweg 5', '9876 ZX Groningen', 'Netherlands')),
  sale('1005', 'Letter', 20, false, 7, addr('Élodie Martin', '12 rue de la Paix', '75002 Paris', 'France')),
  sale('1006', 'Letter', 100, false, 8, addr('Franz Huber', 'Ringstraße 1', '1010 Wien', 'Austria')),
  sale('1007', 'Letter', 20, false, 30, addr('Greta Berg', 'Storgatan 1', '11122 Stockholm', 'Sweden')),
  sale('1008', 'Letter', 20, false, null, addr('Hugo Janssens', 'Grote Markt 1', '1000 Brussel', 'Belgium')),
  sale('1009', 'Letter', 20, false, 3, addr('Ivo Nowak', 'Main Street 1', 'Nowhere', 'Atlantis')),
  sale('1010', 'Letter', 0, false, 3, addr('Jens Olsen', 'Vestergade 2', '1456 København K', 'Denmark')),
  sale('1011', 'Letter', 40, false, 5, addr('Karl Weiß', 'Königsallee 3-5', '40212 Düsseldorf', 'Germany')),
  sale('1012', 'Letter', 20, false, 6, addr('Lieke Smit', 'Plein 1944 12', '6511 AB Nijmegen', 'Netherlands')),
  sale('1013', 'Letter', 50, false, 9, addr('Anton Braun', 'Lindenweg 7', '20095 Hamburg', 'Germany')),
  sale('2001', 'Brievenbuspakje+', 500, true, 40, addr('Maarten Visser', 'Kerkstraat 12-3', '1234 AB Utrecht', 'Netherlands'), { phone: '0612345678' }),
  sale('2002', 'Tracked Parcel (Standaard pakket)', 2000, true, 60, addr('Nina Wagner', 'Straße des 17. Juni 135', '10623 Berlin', 'Germany', ['Hinterhaus'])),
  sale('2003', 'Registered Parcel (Pakket aangetekend € 500)', 1000, true, 120, addr('Olivier Dubois', '8 bis avenue Foch', '69006 Lyon', 'France', ['Appartement 12, 3e étage'])),
  sale('2004', 'Insured Delivery (Verzekerd pakket € 5.500)', 2000, true, 900, addr('Paolo Rossi', 'Via 4 Novembre 10', '00187 Roma', 'Italy'), { phone: '+39 06 1234567' }),
  sale('2005', 'Brievenbuspakje met track & trace (Tracked Letterbox packet)', 500, true, 30, addr('Quinn', 'Rue Neuve 1', '1000 Bruxelles', 'Belgium')),
  sale('2006', 'Pakket', 2000, true, 50, addr('Rolf Keller', 'Hauptstraße 1', '10115 Berlin', 'Germany')),
  sale('2007', 'Klein pakket aangetekend (Registered packet) - Insured up to 50€', 0, true, 45, addr('Sanne Mol', 'Rue du Lac 4', '1000 Brussel', 'Belgium')),
  sale('2008', 'Tracked Parcel (Standaard pakket)', 2000, true, 70, addr('Tomás García', 'Calle Mayor', '28013 Madrid', 'Spain')),
  sale('2009', 'Aangetekend Pakket', 2000, true, 80, addr('Ursula de Boer', 'Laan van Meerdervoort 1000', '2564 AA Den Haag', 'Netherlands')),
  sale('3001', 'SHIPPING COST ESTIMATION for Courier Parcel with Full Insurance', 5000, true, 3000, addr('Vera Kok', 'Markt 1', '5611 EB Eindhoven', 'Netherlands')),
  sale('3002', 'Mystery Tracked', 1000, true, 50, addr('Wim Pauw', 'Markt 2', '5611 EB Eindhoven', 'Netherlands')),
  { id: '3003', error: 'shipping method not found on page' },
];
