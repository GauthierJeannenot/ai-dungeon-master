// PHB2014 Trade Goods4519–4535 and Selling Treasure3915. Explicit IDs only.
// Livestock is a creature/custody procedure; cloth has no printed mass here.
export const TRADE_GOODS={
 wheat:{unit:'lb',priceCp:1},flour:{unit:'lb',priceCp:2},salt:{unit:'lb',priceCp:5},
 iron:{unit:'lb',priceCp:10},canvas:{unit:'square_yard',priceCp:10},
 copper:{unit:'lb',priceCp:50},cotton:{unit:'square_yard',priceCp:50},
 ginger:{unit:'lb',priceCp:100},cinnamon:{unit:'lb',priceCp:200},pepper:{unit:'lb',priceCp:200},
 cloves:{unit:'lb',priceCp:300},silver:{unit:'lb',priceCp:500},linen:{unit:'square_yard',priceCp:500},
 silk:{unit:'square_yard',priceCp:1000},saffron:{unit:'lb',priceCp:1500},gold:{unit:'lb',priceCp:5000},platinum:{unit:'lb',priceCp:50000},
} as const
export const TRADE_GOOD_IDS=Object.keys(TRADE_GOODS) as [keyof typeof TRADE_GOODS,...Array<keyof typeof TRADE_GOODS>]
