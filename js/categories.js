'use strict';
/*
 * Jeu de symboles de l'application.
 *
 * Chaque catégorie porte un pictogramme dessiné ici même, en SVG, sur une
 * grille de 24 × 24. Aucune police d'icônes, aucun émoji : une police d'icônes
 * serait une dépendance de plus, et les émojis ne sont pas dessinés pareil
 * sous Windows et sous Android — or l'application est faite pour être utilisée
 * sur les deux, et une épingle doit se reconnaître d'un coup d'œil, à la même
 * forme, sur les deux écrans.
 *
 * Les pictogrammes sont monochromes (`currentColor` / blanc dans l'épingle) :
 * c'est la couleur de la famille qui porte l'information de groupe, la forme
 * qui porte l'information précise.
 */
(function (racine) {

  /* ---------- Familles ----------
   * Sept familles, sept couleurs. Toutes tiennent le contraste du texte blanc
   * du pictogramme (rapport ≥ 3,5:1 sur le fond de l'épingle). */
  const FAMILLES = {
    patrimoine: { nom: 'Patrimoine', couleur: '#a9631f' },
    nature: { nom: 'Nature', couleur: '#37804d' },
    eau: { nom: 'Mer et eau', couleur: '#1f6fae' },
    gourmand: { nom: 'Table et terroir', couleur: '#c2411f' },
    sejour: { nom: 'Où dormir', couleur: '#6d47b3' },
    loisirs: { nom: 'Loisirs', couleur: '#b32f6b' },
    divers: { nom: 'Divers', couleur: '#55606e' }
  };

  /* ---------- Pictogrammes ----------
   * Rangés par famille, dans l'ordre d'affichage du sélecteur.
   * `g` : contenu SVG brut, grille 24 × 24, sans attribut de couleur.
   */
  const CATEGORIES = {

    /* --- Patrimoine --- */
    musee: {
      nom: 'Musée', famille: 'patrimoine',
      g: '<path d="M12 2.4 1.6 7.9v2.2h20.8V7.9Z"/>' +
         '<path d="M4 11.5h2.6v6.9H4zM10.7 11.5h2.6v6.9h-2.6zM17.4 11.5H20v6.9h-2.6z"/>' +
         '<path d="M2.4 19.6h19.2a.9.9 0 0 1 .9.9v1.1H1.5v-1.1a.9.9 0 0 1 .9-.9Z"/>'
    },
    chateau: {
      nom: 'Château, forteresse', famille: 'patrimoine',
      g: '<path fill-rule="evenodd" d="M2 21.6V6h2v2h2V6h2v4.8h1.7V9h1.6v1.8h1.4V9h1.6v1.8H16V6h2v2h2V6h2v15.6Z' +
         'M10.6 21.6v-4.2a1.4 1.4 0 0 1 2.8 0v4.2Z"/>'
    },
    eglise: {
      nom: 'Église, abbaye', famille: 'patrimoine',
      g: '<path d="M11.15 1.6h1.7v1.8h1.75v1.7h-1.75v3.6h-1.7V5.1H9.4V3.4h1.75Z"/>' +
         '<path fill-rule="evenodd" d="M12 8.4 7.5 12.3v9.3h9v-9.3ZM10.85 21.6v-3.9a1.15 1.15 0 0 1 2.3 0v3.9Z"/>' +
         '<path d="M2.8 14.2h4.1v7.4H2.8zM17.1 14.2h4.1v7.4h-4.1z"/>'
    },
    monument: {
      nom: 'Monument, mémorial', famille: 'patrimoine',
      g: '<path d="M12 1.8 9.5 6.6v10.1h5V6.6Z"/>' +
         '<path d="M7.3 16.9h9.4v2.2H7.3z"/><path d="M5.4 19.3h13.2v2.3H5.4z"/>'
    },
    ruines: {
      nom: 'Site antique, ruines', famille: 'patrimoine',
      g: '<path d="M2.5 6.3h9.8v2.3H2.5z"/>' +
         '<path d="M3.2 8.6H6v13H3.2zM8.8 8.6h2.8v13H8.8zM14 12.3h2.8v9.3H14zM19 15.5h2.6v6.1H19z"/>'
    },
    moulin: {
      nom: 'Moulin', famille: 'patrimoine',
      g: '<path fill-rule="evenodd" d="M8.4 21.6 10.2 10.6h3.6l1.8 11ZM10.9 21.6v-3.4a1.1 1.1 0 0 1 2.2 0v3.4Z"/>' +
         '<g transform="rotate(28 12 7.6)"><path d="M10.7 1.2h2.6v12.8h-2.6z"/><path d="M5.6 6.3h12.8v2.6H5.6z"/></g>' +
         '<circle cx="12" cy="7.6" r="2"/>'
    },
    pont: {
      nom: 'Pont, viaduc', famille: 'patrimoine',
      g: '<path d="M1.2 7.4h21.6v2.4H1.2z"/>' +
         '<path fill-rule="evenodd" d="M2.4 10.2h19.2v11.4H2.4Z' +
         'M4.8 21.6v-3.5a2.8 2.8 0 0 1 5.6 0v3.5Z' +
         'M13.6 21.6v-3.5a2.8 2.8 0 0 1 5.6 0v3.5Z"/>'
    },
    village: {
      nom: 'Village, cité', famille: 'patrimoine',
      g: '<path d="M10.6 1.8h2.8v1.9h1.5v8.5h-5.8V3.7h1.5Z"/>' +
         '<path d="M6.4 8.2 1.2 12.4v9.2h10.4v-9.2Z"/>' +
         '<path d="M17.8 10.4 12.6 14.5v7.1h10.2v-7.1Z"/>'
    },

    /* --- Nature --- */
    cascade: {
      nom: 'Cascade', famille: 'nature',
      g: '<path d="M3 2.4h18a1 1 0 0 1 1 1v2.4H2V3.4a1 1 0 0 1 1-1Z"/>' +
         '<rect x="5.6" y="5.8" width="2.6" height="9.6" rx="1.3"/>' +
         '<rect x="10.7" y="5.8" width="2.6" height="10.8" rx="1.3"/>' +
         '<rect x="15.8" y="5.8" width="2.6" height="9" rx="1.3"/>' +
         '<path d="M1.6 18.4q1.9-1.9 3.8 0t3.8 0 3.8 0 3.8 0 3.8 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' +
         '<path d="M1.6 21.5q1.9-1.9 3.8 0t3.8 0 3.8 0 3.8 0 3.8 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'
    },
    montagne: {
      nom: 'Montagne, sommet', famille: 'nature',
      g: '<path d="M1 21.4 8.3 5.6l4.3 9.2 2.7-4.6 7.7 11.2Z"/>'
    },
    grotte: {
      nom: 'Grotte, gouffre', famille: 'nature',
      /* Contour de rocher irrégulier plutôt qu'une demi-lune : sans cela,
       * l'ouverture se lit comme une arche de pont. Les stalactites sont des
       * sous-tracés à l'intérieur du vide — trois franchissements, donc pleins
       * en règle « evenodd ». */
      g: '<path fill-rule="evenodd" d="M1.4 21.6 2.5 14 5.1 9.2 8.4 5.2 12 3.2l3.8 2.2 3.2 4.4 2.3 4.8 1.3 7Z' +
         'M7.3 21.6c.2-5.9 2.2-9 4.7-9s4.5 3.1 4.7 9Z' +
         'M10 14.6l.8 3.6.7-3.8ZM12.5 13.4l.7 4 .7-4.1Z"/>'
    },
    foret: {
      nom: 'Forêt, parc naturel', famille: 'nature',
      g: '<path d="M7.6 1.8 11.9 9H9.6l4 6.6H1.6l4-6.6H3.3Z"/><path d="M6.4 15.6h2.4v6H6.4z"/>' +
         '<path d="M17.4 7.6 20.7 13h-1.8l3.1 5h-9.2l3.1-5h-1.8Z"/><path d="M16.4 18h2v3.6h-2z"/>'
    },
    jardin: {
      nom: 'Jardin, arboretum', famille: 'nature',
      /* Pétales détachés : cinq disques serrés donnaient un buisson, que rien
       * ne distinguait de la forêt. */
      g: '<ellipse cx="12" cy="4.6" rx="1.9" ry="3.1"/>' +
         '<ellipse cx="15.8" cy="7.4" rx="1.9" ry="3.1" transform="rotate(72 15.8 7.4)"/>' +
         '<ellipse cx="14.35" cy="11.9" rx="1.9" ry="3.1" transform="rotate(144 14.35 11.9)"/>' +
         '<ellipse cx="9.65" cy="11.9" rx="1.9" ry="3.1" transform="rotate(216 9.65 11.9)"/>' +
         '<ellipse cx="8.2" cy="7.4" rx="1.9" ry="3.1" transform="rotate(288 8.2 7.4)"/>' +
         '<circle cx="12" cy="8.6" r="2.3"/>' +
         '<path d="M11.2 11.6h1.6v10h-1.6z"/>' +
         '<path d="M11.4 17.8c-1.8-2.7-4.5-2.9-6.2-1.9 1.1 2.2 3.6 3.2 6.2 2.7Z"/>' +
         '<path d="M12.6 15.2c1.8-2.7 4.5-2.9 6.2-1.9-1.1 2.2-3.6 3.2-6.2 2.7Z"/>'
    },
    panorama: {
      nom: 'Point de vue', famille: 'nature',
      g: '<rect x="3.5" y="2.8" width="4.8" height="7.8" rx="1.6"/>' +
         '<rect x="15.7" y="2.8" width="4.8" height="7.8" rx="1.6"/>' +
         '<rect x="8.8" y="6.2" width="6.4" height="3.2" rx="1.1"/>' +
         '<circle cx="5.9" cy="15.7" r="5.2"/><circle cx="18.1" cy="15.7" r="5.2"/>'
    },

    /* --- Mer et eau --- */
    phare: {
      nom: 'Phare', famille: 'eau',
      g: '<path d="M12 1.4 8.8 4.4h6.4Z"/><path d="M9.4 4.9h5.2v3.4H9.4z"/>' +
         '<path d="M9.7 8.8h4.6l1.5 10.2H8.2Z"/><path d="M6.3 19.3h11.4v2.3H6.3z"/>' +
         '<path d="M7.4 4.2 3.4 2.6M7.4 7.4 3.4 8.6M16.6 4.2l4-1.6M16.6 7.4l4 1.2" ' +
         'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'
    },
    plage: {
      nom: 'Plage, baignade', famille: 'eau',
      g: '<path d="M12 2.2c4.7 0 8.6 3.6 9.2 8.2H2.8C3.4 5.8 7.3 2.2 12 2.2Z"/>' +
         '<path d="M11.2 10.4h1.6v7.6h-1.6z"/>' +
         '<path d="M1.6 18.4q1.9-1.9 3.8 0t3.8 0 3.8 0 3.8 0 3.8 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' +
         '<path d="M1.6 21.5q1.9-1.9 3.8 0t3.8 0 3.8 0 3.8 0 3.8 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'
    },
    lac: {
      nom: 'Lac, rivière', famille: 'eau',
      g: '<path d="M1.6 6.6q2.3-2.2 4.6 0t4.6 0 4.6 0 4.6 0" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>' +
         '<path d="M1.6 12q2.3-2.2 4.6 0t4.6 0 4.6 0 4.6 0" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>' +
         '<path d="M1.6 17.4q2.3-2.2 4.6 0t4.6 0 4.6 0 4.6 0" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>'
    },
    ile: {
      nom: 'Île', famille: 'eau',
      g: '<path d="M12.7 15.2c-1.2-3.9-.7-6.4-.7-6.4l2 .3s-.4 2.5.8 6.1Z"/>' +
         '<path d="M12.4 8.9C10 6 6.5 5.5 4.8 7.3c2.5-.5 5.3.9 7.1 2.6Z"/>' +
         '<path d="M12.7 8.2c-.4-3.8 1.9-6.6 4.5-6.7-1.6 1.9-2.4 4.5-2.4 6.8Z"/>' +
         '<path d="M13.5 8.6c2.6-2.8 6.1-3 7.7-1.2-2.4-.4-5.1 1-6.7 2.6Z"/>' +
         '<path d="M13.7 10c2.9-1 5.7.4 6.4 2.6-2-1.4-4.5-1.6-6.5-1Z"/>' +
         '<path d="M3.4 18.8c0-2.8 3.9-4.6 8.6-4.6s8.6 1.8 8.6 4.6Z"/>' +
         '<path d="M1.6 21.4q1.9-1.9 3.8 0t3.8 0 3.8 0 3.8 0 3.8 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'
    },
    port: {
      nom: 'Port, marina', famille: 'eau',
      g: '<circle cx="12" cy="4" r="2.5" fill="none" stroke="currentColor" stroke-width="1.9"/>' +
         '<path d="M11.1 6.6h1.8v14.4h-1.8z"/><path d="M7.4 8.6h9.2v1.9H7.4z"/>' +
         '<path d="M3.4 12.6a8.6 8.6 0 0 0 8.6 8.6 8.6 8.6 0 0 0 8.6-8.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>' +
         '<path d="M1.6 10.4h4.2l-2.1 4.2ZM18.2 10.4h4.2l-2.1 4.2Z"/>'
    },

    /* --- Table et terroir --- */
    restaurant: {
      nom: 'Restaurant, table', famille: 'gourmand',
      g: '<path d="M4.6 1.8h1.7v6h1V1.8h1.7v6h1v-6h1.7v6.4a3 3 0 0 1-1.9 2.8v11h-2.4v-11a3 3 0 0 1-1.9-2.8Z"/>' +
         '<path d="M17.4 1.8c1.9 1.8 2.9 4.6 2.9 7.4 0 2.4-.9 4-2.3 4.6v8.2h-2.5V1.8Z"/>'
    },
    marche: {
      nom: 'Marché, producteur', famille: 'gourmand',
      g: '<path d="M8.2 8.6a3.8 3.8 0 0 1 7.6 0" fill="none" stroke="currentColor" stroke-width="1.9"/>' +
         '<path d="M2.6 9.4h18.8l-1.7 10.8a1.7 1.7 0 0 1-1.7 1.4H6a1.7 1.7 0 0 1-1.7-1.4Z"/>'
    },
    vignoble: {
      nom: 'Vignoble, cave', famille: 'gourmand',
      g: '<path d="M11.3 3.4h1.4v5.2h-1.4z"/>' +
         '<path d="M12.7 5.2c1.7-2.6 4.5-3 6.2-2-1 2.5-3.4 3.8-6.2 3.4Z"/>' +
         '<circle cx="8.4" cy="10.6" r="2.5"/><circle cx="12" cy="10.6" r="2.5"/><circle cx="15.6" cy="10.6" r="2.5"/>' +
         '<circle cx="10.2" cy="14.6" r="2.5"/><circle cx="13.8" cy="14.6" r="2.5"/>' +
         '<circle cx="12" cy="18.6" r="2.5"/>'
    },

    /* --- Où dormir --- */
    gite: {
      nom: 'Gîte, chambre d\'hôtes', famille: 'sejour',
      g: '<path fill-rule="evenodd" d="M12 2.2 1.4 11.1h2.5v10.5h16.2V11.1h2.5Z' +
         'M10.6 21.6v-4.3a1.4 1.4 0 0 1 2.8 0v4.3Z' +
         'M6.9 12.4h3.2v3.2H6.9Z"/>' +
         '<path d="M16.4 4.4h2.6v2.9l-2.6-2.2Z"/>'
    },
    hotel: {
      nom: 'Hôtel', famille: 'sejour',
      g: '<path d="M1.6 6.4h2.7v14.8H1.6z"/>' +
         '<path d="M4.3 12.6h18.1v4.4H4.3z"/>' +
         '<rect x="5.7" y="9" width="5.8" height="3.6" rx="1.3"/>' +
         '<path d="M19.7 17h2.7v4.2h-2.7z"/>'
    },
    camping: {
      nom: 'Camping, bivouac', famille: 'sejour',
      g: '<path d="M12 2.6 1.3 21.4h7.3L12 14.4l3.4 7h7.3Z"/>'
    },

    /* --- Loisirs --- */
    zoo: {
      nom: 'Parc animalier', famille: 'loisirs',
      g: '<ellipse cx="5.9" cy="9.4" rx="2.5" ry="3.2"/><ellipse cx="10.1" cy="6.3" rx="2.5" ry="3.3"/>' +
         '<ellipse cx="14.6" cy="6.3" rx="2.5" ry="3.3"/><ellipse cx="18.4" cy="9.4" rx="2.5" ry="3.2"/>' +
         '<path d="M12 12.4c3.6 0 6.4 2.8 6.4 5.6 0 2-1.6 3.6-3.6 3.6-1.2 0-2.1-.5-2.8-.5s-1.6.5-2.8.5c-2 0-3.6-1.6-3.6-3.6 0-2.8 2.8-5.6 6.4-5.6Z"/>'
    },
    thermes: {
      nom: 'Thermes, spa', famille: 'loisirs',
      g: '<path d="M2 14.6h20a1 1 0 0 1 1 1.1c-.5 3.4-3.4 5.7-7.2 5.7H8.2C4.4 21.4 1.5 19.1 1 15.7a1 1 0 0 1 1-1.1Z"/>' +
         '<path d="M7.4 12.2c-1.8-1.6-1.8-3.2 0-4.8s1.8-3.2 0-4.8M12 12.2c-1.8-1.6-1.8-3.2 0-4.8s1.8-3.2 0-4.8M16.6 12.2c-1.8-1.6-1.8-3.2 0-4.8s1.8-3.2 0-4.8" ' +
         'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'
    },
    festival: {
      nom: 'Festival, spectacle', famille: 'loisirs',
      g: '<path fill-rule="evenodd" d="M1.8 6.4h20.4v3.4a2.2 2.2 0 0 0 0 4.4v3.4H1.8v-3.4a2.2 2.2 0 0 0 0-4.4Z' +
         'M12 8.9l1.3 2.7 2.9.4-2.1 2 .5 2.9-2.6-1.4-2.6 1.4.5-2.9-2.1-2 2.9-.4Z"/>'
    },
    randonnee: {
      nom: 'Randonnée, sentier', famille: 'loisirs',
      g: '<path d="M6.4 1.6c2.1 0 3.4 1.9 3.4 4.4 0 1.9-.6 3.2-1 4.6-.3 1-.4 2-.4 3.1H4.4c0-1.1-.1-2.1-.4-3.1-.4-1.4-1-2.7-1-4.6 0-2.5 1.3-4.4 3.4-4.4Z"/>' +
         '<path d="M4.2 15h4.4a.8.8 0 0 1 .8.8v1.5c0 1.5-1.1 2.6-2.9 2.6s-3-1.1-3-2.6v-1.5a.8.8 0 0 1 .7-.8Z"/>' +
         '<path d="M17.6 8.4c2.1 0 3.4 1.9 3.4 4.4 0 1.9-.6 3.2-1 4.6-.3 1-.4 2-.4 3.1h-4a17 17 0 0 0-.4-3.1c-.4-1.4-1-2.7-1-4.6 0-2.5 1.3-4.4 3.4-4.4Z"/>' +
         '<path d="M15.4 21.8h4.4a.8.8 0 0 1 .8.8v.9h-6v-.9a.8.8 0 0 1 .8-.8Z"/>'
    },
    velo: {
      nom: 'Vélo, voie verte', famille: 'loisirs',
      g: '<circle cx="5.3" cy="16.4" r="4.3" fill="none" stroke="currentColor" stroke-width="1.9"/>' +
         '<circle cx="18.7" cy="16.4" r="4.3" fill="none" stroke="currentColor" stroke-width="1.9"/>' +
         '<path d="M5.3 16.4h5.9l3.4-7.6 4.1 7.6M11.2 16.4 15.6 8.8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"/>' +
         '<path d="M13.4 8.2h4.2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>' +
         '<path d="M8.8 9.4h3.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>'
    },
    train: {
      nom: 'Train touristique', famille: 'loisirs',
      g: '<path d="M2.6 4.2h3.4v4.2H2.6z"/>' +
         '<path d="M1.6 8.2h9.8v7.4H1.6z"/>' +
         '<path fill-rule="evenodd" d="M11.4 3.6h8.2v12h-8.2Z M13.4 5.8h4.2v3.6h-4.2Z"/>' +
         '<path d="M1.2 15.6h20.6v2.2H1.2z"/>' +
         '<circle cx="5.8" cy="19.6" r="2.2"/><circle cx="16.6" cy="19.6" r="2.2"/>'
    },

    /* --- Divers --- */
    boutique: {
      nom: 'Artisanat, boutique', famille: 'divers',
      g: '<path d="M8.2 8.6a3.8 3.8 0 0 1 7.6 0" fill="none" stroke="currentColor" stroke-width="1.9"/>' +
         '<path fill-rule="evenodd" d="M4.4 6.6h15.2l1.4 14a1 1 0 0 1-1 1.1H4a1 1 0 0 1-1-1.1Z' +
         'M9.4 9.6h1.9v2.6H9.4ZM12.7 9.6h1.9v2.6h-1.9Z"/>'
    },
    autre: {
      nom: 'Autre envie', famille: 'divers',
      g: '<path d="M5.6 1.9h12.8v20L12 16.9l-6.4 5Z"/>'
    }
  };

  const ORDRE = Object.keys(CATEGORIES);

  /* ---------- Rendu ---------- */

  /* Pictogramme seul, pour les listes et le sélecteur. */
  function svgSymbole(cle, taille) {
    const c = CATEGORIES[cle] || CATEGORIES.autre;
    const t = taille || 24;
    return '<svg class="sym" viewBox="0 0 24 24" width="' + t + '" height="' + t +
      '" aria-hidden="true" focusable="false" fill="currentColor">' + c.g + '</svg>';
  }

  /* Épingle complète pour la carte.
   * `etoiles` (0-3) et `visite` ajoutent une pastille en haut à droite : sur la
   * carte, savoir d'un coup d'œil ce qui est déjà vu — et ce qu'on en a pensé —
   * vaut mieux qu'une couleur de plus. */
  function svgEpingle(cle, opts) {
    const o = opts || {};
    const c = CATEGORIES[cle] || CATEGORIES.autre;
    const couleur = o.couleur || FAMILLES[c.famille].couleur;
    const L = 36, H = 47;
    let s = '<svg viewBox="0 0 36 47" width="' + L + '" height="' + H + '" aria-hidden="true" focusable="false">';
    s += '<path d="M18 45.4S33.2 27 33.2 17.4A15.2 15.2 0 1 0 2.8 17.4C2.8 27 18 45.4 18 45.4Z" ' +
      'fill="' + couleur + '" stroke="#ffffff" stroke-width="2.6" stroke-linejoin="round"/>';
    s += '<g transform="translate(18 17.4) scale(0.76) translate(-12 -12)" fill="#ffffff">' + c.g + '</g>';
    if (o.visite) {
      s += '<circle cx="28.6" cy="7.6" r="7" fill="#ffffff" stroke="' + couleur + '" stroke-width="1.6"/>';
      if (o.etoiles > 0) {
        s += '<text x="28.6" y="11.1" text-anchor="middle" font-size="9.6" font-weight="700" ' +
          'font-family="system-ui, sans-serif" fill="' + couleur + '">' + o.etoiles + '</text>';
      } else {
        s += '<path d="m25.2 7.7 2.4 2.6 4.4-4.8" fill="none" stroke="' + couleur +
          '" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>';
      }
    }
    return s + '</svg>';
  }

  function couleurDe(cle) {
    const c = CATEGORIES[cle] || CATEGORIES.autre;
    return FAMILLES[c.famille].couleur;
  }

  function nomDe(cle) {
    const c = CATEGORIES[cle];
    return c ? c.nom : CATEGORIES.autre.nom;
  }

  /* Catégories regroupées par famille, dans l'ordre de déclaration. */
  function parFamille() {
    const out = [];
    Object.keys(FAMILLES).forEach((f) => {
      const cles = ORDRE.filter((k) => CATEGORIES[k].famille === f);
      if (cles.length) out.push({ cle: f, nom: FAMILLES[f].nom, couleur: FAMILLES[f].couleur, categories: cles });
    });
    return out;
  }

  racine.CAT = {
    FAMILLES: FAMILLES, CATEGORIES: CATEGORIES, ORDRE: ORDRE,
    svgSymbole: svgSymbole, svgEpingle: svgEpingle,
    couleurDe: couleurDe, nomDe: nomDe, parFamille: parFamille
  };

})(typeof self !== 'undefined' ? self : this);
