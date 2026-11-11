---
name: ranger
description: Range la Galaxie avec l'utilisateur. Claude regarde ses projets, propose des galaxies (Pro, Perso…) et des thèmes, puis range chaque projet après son accord. À utiliser quand l'utilisateur tape /galaxie:ranger, demande d'organiser, de ranger ou de trier sa Galaxie ou ses projets, ou depuis /galaxie:installer.
---

# Ranger la Galaxie

Tu aides un débutant à organiser ses projets. Réponds en français, en tutoyant, sans jargon, en phrases courtes.

Rappel du vocabulaire de la Galaxie :
- une **galaxie** = un grand domaine de sa vie (Pro, Perso, Formation…) ;
- un **soleil** = un thème dans cette galaxie (un client, une activité, un sujet) ;
- une **planète** = un projet (un dossier où il a travaillé avec Claude).

## Règles

- **Rien n'est rangé sans un « oui » clair** sur la proposition complète.
- Tu proposes, l'utilisateur décide : il peut renommer, déplacer, retirer. Reformule la proposition après chaque changement.
- Base-toi sur ce que tu vois (nom du projet, dossier parent `dans`, exemples de conversations). Si un projet est ambigu, demande ou laisse-le hors rangement plutôt que de deviner.
- Le rangement n'efface rien : ce qui n'est pas cité reste en place, une sauvegarde est faite, et tout se modifie ensuite dans la Galaxie.

Dans les commandes ci-dessous, utilise `node`, ou le chemin complet de Node si `/galaxie:installer` en a trouvé un autre.

## 1 · Regarder les projets

```
node "${CLAUDE_PLUGIN_ROOT}/app/server.js" --list-projects
```

La réponse (JSON) donne le rangement actuel (`galaxies`, avec leurs thèmes) et la liste des `projets` : `chemin`, `nom`, `dans` (dossier parent), `theme`, `galaxie`, `conversations`, `derniere_activite`, `exemples_de_conversations`. Le projet `dossier_perso` (le dossier personnel) se laisse de côté sauf demande.

- **Moins de 3 projets** : dis que c'est encore un peu tôt, que la Galaxie se remplit au fil du travail avec Claude, et qu'on pourra relancer `/galaxie:ranger` plus tard. Arrête-toi là.
- **Déjà rangée** (plusieurs galaxies et `sans_theme` faible) : montre le rangement actuel en arbre et demande s'il veut seulement ranger les projets restants, ou tout revoir.

## 2 · Choisir les galaxies

Explique en une phrase ce qu'est une galaxie. Puis propose 2 ou 3 galaxies déduites de ses projets, par exemple :
- **Pro** : clients, travail, entreprise ;
- **Perso** : loisirs, maison, famille ;
- **Formation** : cours, exercices, Ottho ;
- **Outils** : ses propres outils, automatisations, essais d'IA.

Utilise l'outil de question à choix s'il est disponible (choix multiples, l'utilisateur peut écrire ses propres noms). Conseille de rester simple : 2 ou 3 galaxies suffisent, 4 au maximum.

## 3 · Proposer les thèmes et ranger les projets

Pour chaque galaxie choisie, propose des thèmes et place chaque projet. Les thèmes qui existent déjà (souvent créés tout seuls au premier lancement, un par dossier qui contient des sous-projets) font partie de la proposition : garde-les sous leur nom pour les placer dans une galaxie, sinon ils restent dans l'ancienne galaxie « Projets ». Bons repères :
- un thème regroupe idéalement **plusieurs** projets (un client et ses sites, une activité et ses essais) ;
- les projets d'un même dossier parent (`dans`) vont souvent ensemble ;
- un projet seul et sans lien évident peut aller dans un thème plus large, ou rester hors rangement ;
- les projets qui ressemblent à des essais (`test`, `essai`, `tmp`, sans conversation récente) : propose de les **masquer**. C'est réversible (⚙ Réglages → réafficher).

Montre la proposition complète sous forme d'arbre, par exemple :

```
🌌 Pro
   ☀ Clients : site-dupont, logo-martin
   ☀ Mon entreprise : factures, site-vitrine
🌌 Perso
   ☀ Voyages : japon-2026
Pas rangés : brouillon
À masquer : test, essai
```

Demande : « Ça te va ? Tu peux renommer, déplacer un projet, en retirer un. » Ajuste jusqu'à un « oui ».

## 4 · Appliquer

Écris le plan avec l'outil d'écriture dans le fichier `rangement.json` du dossier `.galaxie` de l'utilisateur (`~/.galaxie/rangement.json`, chemin complet). Les chemins des projets sont recopiés **exactement** depuis `chemin` :

```json
{
  "galaxies": [
    { "nom": "Pro", "themes": [
      { "nom": "Clients", "projets": ["C:\\Users\\…\\site-dupont", "C:\\Users\\…\\logo-martin"] }
    ] },
    { "nom": "Perso", "themes": [
      { "nom": "Voyages", "projets": ["C:\\Users\\…\\japon-2026"] }
    ] }
  ],
  "masquer": ["C:\\Users\\…\\test"]
}
```

Puis lance :

```
node "${CLAUDE_PLUGIN_ROOT}/app/server.js" --organize "<chemin complet de rangement.json>"
```

La réponse indique les galaxies et thèmes créés, le nombre de projets rangés et masqués, et les `introuvables` (chemin mal recopié : corrige et relance, sans risque de doublon).

## 5 · Bilan

En trois lignes :
- ce qui a été rangé ;
- la Galaxie se met à jour toute seule quand on clique dans sa fenêtre (sinon touche **F5**) ;
- tout se change ensuite dans la Galaxie : clic sur un soleil ou une galaxie pour le renommer, sur une planète pour changer son thème. Pour revenir en arrière, une sauvegarde a été faite (`config.avant-rangement.json` dans `~/.galaxie`), et on peut relancer `/galaxie:ranger` à tout moment.
