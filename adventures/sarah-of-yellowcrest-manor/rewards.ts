import type { AdventureRewardDefinition } from '../../lib/adventure-reward-state'

// CM9 printed rewards. No seeding, discovery, ownership, NPC power or wallet credit.
export const YELLOWCREST_REWARDS: AdventureRewardDefinition[] = [
  {
    "id": "faerl_strongbox",
    "label": "faerl strongbox",
    "mapId": "waterdeep",
    "roomId": "8",
    "source": {
      "book": "candlekeep-mysteries",
      "chapter": "CM:9",
      "section": "28f",
      "page": 104,
      "sha256": "eee270953f4588f0af8c8be0b63937e3738f0a02770b6cb47320e03b1078885c"
    },
    "owner": "enemy",
    "sourceDescription": "locked iron strongbox in coach",
    "items": [],
    "coins": {
      "gp": 35,
      "sp": 400
    },
    "sourceNpcId": "faerl_city",
    "encounterId": "faerl_bodyguards",
    "containerRequired": true,
    "sourceConditions": {"outcome":"victory","preventOwnerEscape":true}
  },
  {
    "id": "faerl_personal",
    "label": "faerl personal",
    "mapId": "waterdeep",
    "roomId": "8",
    "source": {
      "book": "candlekeep-mysteries",
      "chapter": "CM:9",
      "section": "28f",
      "page": 104,
      "sha256": "eee270953f4588f0af8c8be0b63937e3738f0a02770b6cb47320e03b1078885c"
    },
    "owner": "enemy",
    "sourceDescription": "Faerl belt and purse/worn jewelry",
    "items": [
      {
        "id": "faerl_personal:magic:0",
        "name": "Fiole de liquide rouge",
        "description": "Objet physique trouvé à son emplacement source ; propriétés à identifier séparément.",
        "kind": "magic",
        "templateId": "potion_of_superior_healing"
      },
      {
        "id": "faerl_personal:art:0:0",
        "name": "Faerl jewelry lot",
        "description": "Bien matériel du chapitre ; aucune conversion automatique en pièces.",
        "kind": "valuable",
        "valueGp": 20
      }
    ],
    "coins": {
      "gp": 20
    },
    "sourceNpcIds": [
      "faerl_city",
      "faerl_village"
    ]
  },
  {
    "id": "arcane_study",
    "label": "arcane study",
    "mapId": "temple",
    "roomId": "19",
    "source": {
      "book": "candlekeep-mysteries",
      "chapter": "CM:9",
      "section": "2b0",
      "page": 110,
      "sha256": "eee270953f4588f0af8c8be0b63937e3738f0a02770b6cb47320e03b1078885c"
    },
    "owner": "unclaimed",
    "sourceDescription": "B2 desk drawer/table wooden box",
    "items": [
      {
        "id": "arcane_study:magic:0",
        "name": "Tube de métal creux",
        "description": "Objet physique trouvé à son emplacement source ; propriétés à identifier séparément.",
        "kind": "magic",
        "templateId": "chime_of_opening"
      },
      {
        "id": "arcane_study:art:0:0",
        "name": "gold medallion",
        "description": "Bien matériel du chapitre ; aucune conversion automatique en pièces.",
        "kind": "valuable",
        "valueGp": 125
      },
      {
        "id": "arcane_study:art:0:1",
        "name": "gold medallion",
        "description": "Bien matériel du chapitre ; aucune conversion automatique en pièces.",
        "kind": "valuable",
        "valueGp": 125
      }
    ]
  },
  {
    "id": "cult_library",
    "label": "cult library",
    "mapId": "temple",
    "roomId": "23",
    "source": {
      "book": "candlekeep-mysteries",
      "chapter": "CM:9",
      "section": "2ba",
      "page": 111,
      "sha256": "eee270953f4588f0af8c8be0b63937e3738f0a02770b6cb47320e03b1078885c"
    },
    "owner": "unclaimed",
    "sourceDescription": "B6 bookcase",
    "items": [
      {
        "id": "cult_library:collection",
        "name": "Collection de traités occultes",
        "description": "Collection entière ; valeur300po uniquement pour un acheteur avisé réellement établi, sinon don discrétionnaire sans bénéfice automatique.",
        "kind": "collection",
        "valueGp": 300
      }
    ]
  },
  {
    "id": "viallis_personal",
    "label": "viallis personal",
    "mapId": "temple",
    "roomId": "24",
    "source": {
      "book": "candlekeep-mysteries",
      "chapter": "CM:9",
      "section": "2c4",
      "page": 112,
      "sha256": "eee270953f4588f0af8c8be0b63937e3738f0a02770b6cb47320e03b1078885c"
    },
    "owner": "enemy",
    "sourceDescription": "Viallis worn robe/carried scroll and keys",
    "items": [
      {
        "id": "viallis_personal:magic:0",
        "name": "Robe chatoyante",
        "description": "Objet physique trouvé à son emplacement source ; propriétés à identifier séparément.",
        "kind": "magic",
        "templateId": "robe_of_scintillating_colors"
      },
      {
        "id": "viallis_personal:scroll:1",
        "name": "Parchemin à caractères mystiques",
        "description": "Parchemin physique de provenance conservée ; déchiffrage de classe requis.",
        "kind": "scroll",
        "spellId": "teleport"
      }
    ],
    "encounterId": "viallis_ritual",
    "participantIndex": 0
  },
  {
    "id": "chapel_offerings",
    "label": "chapel offerings",
    "mapId": "temple",
    "roomId": "24",
    "source": {
      "book": "candlekeep-mysteries",
      "chapter": "CM:9",
      "section": "2c4",
      "page": 112,
      "sha256": "eee270953f4588f0af8c8be0b63937e3738f0a02770b6cb47320e03b1078885c"
    },
    "owner": "unclaimed",
    "sourceDescription": "B7 altar offerings",
    "items": [
      {
        "id": "chapel_offerings:art:0:0",
        "name": "gold bracelet",
        "description": "Bien matériel du chapitre ; aucune conversion automatique en pièces.",
        "kind": "valuable",
        "valueGp": 150
      },
      {
        "id": "chapel_offerings:art:0:1",
        "name": "gold bracelet",
        "description": "Bien matériel du chapitre ; aucune conversion automatique en pièces.",
        "kind": "valuable",
        "valueGp": 150
      },
      {
        "id": "chapel_offerings:art:0:2",
        "name": "gold bracelet",
        "description": "Bien matériel du chapitre ; aucune conversion automatique en pièces.",
        "kind": "valuable",
        "valueGp": 150
      },
      {
        "id": "chapel_offerings:art:0:3",
        "name": "gold bracelet",
        "description": "Bien matériel du chapitre ; aucune conversion automatique en pièces.",
        "kind": "valuable",
        "valueGp": 150
      },
      {
        "id": "chapel_offerings:art:0:4",
        "name": "gold bracelet",
        "description": "Bien matériel du chapitre ; aucune conversion automatique en pièces.",
        "kind": "valuable",
        "valueGp": 150
      }
    ]
  },
  {
    "id": "prisoner_effects",
    "label": "prisoner effects",
    "mapId": "temple",
    "roomId": "25",
    "source": {
      "book": "candlekeep-mysteries",
      "chapter": "CM:9",
      "section": "2c8",
      "page": 112,
      "sha256": "eee270953f4588f0af8c8be0b63937e3738f0a02770b6cb47320e03b1078885c"
    },
    "owner": "victims",
    "sourceDescription": "B8 two unlocked chests",
    "items": [
      {
        "id": "prisoner_effects:art:0:0",
        "name": "pair jeweled earrings",
        "description": "Bien matériel du chapitre ; aucune conversion automatique en pièces.",
        "kind": "valuable",
        "valueGp": 150
      },
      {
        "id": "prisoner_effects:gear:0:0",
        "name": "Épée longue",
        "description": "Effet matériel pris aux voyageurs ; droit de propriété conservé.",
        "kind": "equipment",
        "equipmentId": "longsword"
      },
      {
        "id": "prisoner_effects:gear:1:0",
        "name": "Dague",
        "description": "Effet matériel pris aux voyageurs ; droit de propriété conservé.",
        "kind": "equipment",
        "equipmentId": "dagger"
      },
      {
        "id": "prisoner_effects:gear:1:1",
        "name": "Dague",
        "description": "Effet matériel pris aux voyageurs ; droit de propriété conservé.",
        "kind": "equipment",
        "equipmentId": "dagger"
      }
    ],
    "coins": {
      "gp": 115
    }
  },
  {
    "id": "acolyte_scroll",
    "label": "acolyte scroll",
    "mapId": "cellar",
    "roomId": "31",
    "source": {
      "book": "candlekeep-mysteries",
      "chapter": "CM:9",
      "section": "2d3",
      "page": 113,
      "sha256": "eee270953f4588f0af8c8be0b63937e3738f0a02770b6cb47320e03b1078885c"
    },
    "owner": "unclaimed",
    "sourceDescription": "B12 scrolls on floor",
    "items": [
      {
        "id": "acolyte_scroll:scroll",
        "name": "Parchemin à caractères mystiques",
        "description": "Parchemin trouvé dans les documents de la salle ; aucun sort offert par simple ramassage.",
        "kind": "scroll",
        "spellId": "counterspell"
      }
    ]
  }
]
