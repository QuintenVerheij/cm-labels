# Cardmarket shipping method (text before "(max. NNNg)") -> PostNL product and option on
# jouw.postnl.nl/online-versturen/nl-NL/pakket/kiezen. Origin is always NL.
#
#   Service  stamp   = postzegelcode and a 70x40 label
#            postnl  = tracked PostNL label: pick Product + Option by label text, weight from max. NNNg
#            manual  = not automated; buy by hand
#   Product  PostNL card text under "Wat wil je versturen?"
#   Option   PostNL radio text under "Hoe wil je het versturen?"
#   Only     ISO code of the one country the method exists for (from shipping-costs.csv); absent = no restriction
#   Seen     order = matched to a past tracked sale; page = product and option seen on the PostNL page;
#            guess = not yet confirmed on PostNL, check before the first real order
#
# Weight: take max. NNNg from the order's method line and pick the smallest PostNL weight band that
# holds it ("0 tot 500 gram", "500 tot 1000 gram", "0 tot 2 kilo", "2 tot 5 kilo", ...). If the page
# has no weight choice (NL Brievenbuspakje, BE Brievenbuspakje), pick nothing.
# Max. article values per method and country are in shipping-costs.csv; Cardmarket already enforces them.
@{
  # ---- no tracking
  'Letter' = @{ Service = 'stamp' }
  'Brief'  = @{ Service = 'stamp'; Only = 'NL' }

  # ---- NL domestic
  'Brievenbuspakje+'           = @{ Service = 'postnl'; Product = 'Brievenbuspakje'; Option = 'Met track & trace'; Only = 'NL'; Seen = 'order' }
  'Pakket'                     = @{ Service = 'postnl'; Product = 'Gemiddeld pakket'; Option = 'Met track & trace'; Only = 'NL'; Seen = 'guess' }
  'Aangetekend Pakket'         = @{ Service = 'postnl'; Product = 'Gemiddeld pakket'; Option = 'Aangetekend'; Only = 'NL'; Seen = 'guess' }
  'Pakket met Verzekerservice' = @{ Service = 'postnl'; Product = 'Gemiddeld pakket'; Option = 'Verzekerd'; Only = 'NL'; Seen = 'guess' }

  # ---- EU (all countries except NL; IS and LI have only the letterbox and Klein pakket methods)
  'Brievenbuspakje met track & trace (Tracked Letterbox packet)'       = @{ Service = 'postnl'; Product = 'Brievenbuspakje'; Option = 'Met track & trace'; Seen = 'order' }
  'Klein pakket aangetekend (Registered packet) - Insured up to 50€'   = @{ Service = 'postnl'; Product = 'Klein pakket'; Option = 'Verzekerd tot €50'; Seen = 'page' }
  'Klein pakket aangetekend (Registered packet) R - Insured up to 50€' = @{ Service = 'postnl'; Product = 'Klein pakket'; Option = 'Verzekerd tot €50'; Seen = 'page' }
  'Tracked Parcel (Standaard pakket)'                                  = @{ Service = 'postnl'; Product = 'Gemiddeld pakket'; Option = 'Met track & trace'; Seen = 'page' }
  'Registered Parcel (Pakket aangetekend € 500)'                       = @{ Service = 'postnl'; Product = 'Gemiddeld pakket'; Option = 'Aangetekend tot €500'; Seen = 'order' }
  'Insured Delivery (Verzekerd pakket € 5.500)'                        = @{ Service = 'postnl'; Product = 'Gemiddeld pakket'; Option = 'Verzekerd tot €5500'; Seen = 'page' }

  # ---- courier, all countries
  'SHIPPING COST ESTIMATION for Courier Parcel with Full Insurance' = @{ Service = 'manual' }
}
