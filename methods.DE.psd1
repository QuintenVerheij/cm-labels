# Cardmarket shipping method (text before "(max. NNNg)") for a seller in Germany -> how it is sent. Origin is always DE.
# Fields as in methods.psd1; every method is Service stamp or manual.
#
#   Service  stamp   = letter bought as an Internetmarke (Deutsche Post); cm-labels prints the 70x40 label
#            manual  = not automated; buy by hand. Reason says why.
#   Carrier  deutschepost, dhl, or none = no shop
#   Reason   manual only: shown in the run in place of the generic "buy by hand"
#
# A method name appears once here however many weight rows it has (the weights are in shipping-costs.DE.csv).
@{
  # ---- letters
  'Standardbrief'          = @{ Service = 'stamp'; Carrier = 'deutschepost' }
  'Kompaktbrief'           = @{ Service = 'stamp'; Carrier = 'deutschepost' }
  'Grossbrief'             = @{ Service = 'stamp'; Carrier = 'deutschepost' }
  'Maxibrief'              = @{ Service = 'stamp'; Carrier = 'deutschepost' }
  'Letter (Standardbrief)' = @{ Service = 'stamp'; Carrier = 'deutschepost' }

  # ---- registered letters
  'Kompaktbrief + Einschreiben EINWURF' = @{ Service = 'manual'; Carrier = 'deutschepost'; Reason = 'Einschreiben Einwurf is not in a cart yet' }
  'Grossbrief + Einschreiben EINWURF'   = @{ Service = 'manual'; Carrier = 'deutschepost'; Reason = 'Einschreiben Einwurf is not in a cart yet' }

  # ---- DHL parcels, domestic
  'DHL Päckchen S'                            = @{ Service = 'manual'; Carrier = 'dhl'; Reason = 'DHL labels are not in a cart yet' }
  'DHL Päckchen M'                            = @{ Service = 'manual'; Carrier = 'dhl'; Reason = 'DHL labels are not in a cart yet' }
  'DHL Paket (Online)'                        = @{ Service = 'manual'; Carrier = 'dhl'; Reason = 'DHL labels are not in a cart yet' }
  'DHL Paket'                                 = @{ Service = 'manual'; Carrier = 'dhl'; Reason = 'DHL labels are not in a cart yet' }
  'DHL Paket (Online) Versicherung bis 2.500€' = @{ Service = 'manual'; Carrier = 'dhl'; Reason = 'DHL labels are not in a cart yet' }
  'DHL Paket Versicherung bis 2.500€'         = @{ Service = 'manual'; Carrier = 'dhl'; Reason = 'DHL labels are not in a cart yet' }

  # ---- DHL parcels, abroad
  'Small Parcel (Päckchen XS)'                   = @{ Service = 'manual'; Carrier = 'dhl'; Reason = 'DHL labels are not in a cart yet' }
  'Small Parcel (Päckchen M)'                    = @{ Service = 'manual'; Carrier = 'dhl'; Reason = 'DHL labels are not in a cart yet' }
  'Parcel (DHL Päckchen M Online)'               = @{ Service = 'manual'; Carrier = 'dhl'; Reason = 'DHL labels are not in a cart yet' }
  'Registered Parcel (DHL Paket Online)'         = @{ Service = 'manual'; Carrier = 'dhl'; Reason = 'DHL labels are not in a cart yet' }
  'Registered Parcel (DHL Paket Welt Online)'    = @{ Service = 'manual'; Carrier = 'dhl'; Reason = 'DHL labels are not in a cart yet' }
  'Insured Parcel (DHL Wertpaket 1.000€)'        = @{ Service = 'manual'; Carrier = 'dhl'; Reason = 'DHL labels are not in a cart yet' }
  'Insured Parcel (DHL Wertpaket 2.000€)'        = @{ Service = 'manual'; Carrier = 'dhl'; Reason = 'DHL labels are not in a cart yet' }
  'DHL Express'                                  = @{ Service = 'manual'; Carrier = 'dhl'; Reason = 'DHL Express is booked by hand' }
  'DHL Express Insurance 1.500 €'                = @{ Service = 'manual'; Carrier = 'dhl'; Reason = 'DHL Express is booked by hand' }
  'DHL Express Insurance 2.500 €'                = @{ Service = 'manual'; Carrier = 'dhl'; Reason = 'DHL Express is booked by hand' }
  'DHL Express Insurance 5.000 €'                = @{ Service = 'manual'; Carrier = 'dhl'; Reason = 'DHL Express is booked by hand' }

  # ---- no shop
  'SHIPPING COST ESTIMATION for Courier Parcel with Full Insurance' = @{ Service = 'manual'; Carrier = 'none'; Reason = 'a courier estimate: find a courier and ship by hand' }
  'Virtual Delivery'                                                = @{ Service = 'manual'; Carrier = 'none'; Reason = 'nothing to ship: deliver it digitally' }
}
