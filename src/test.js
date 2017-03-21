const nano = require( 'nano' )( 'http://localhost:5984' );

const indexers = require( './modules/indexers' );
const isValidPost = require( './modules/isValidPost.js' );

const postDatabase = nano.db.use( 'posts' );
const peopleDatabase = nano.db.use( 'people' );
const gameDatabase = nano.db.use( 'games' );

peopleDatabase.list( {
    // eslint-disable-next-line camelcase
    include_docs: true,
    limit: 1000,
}, ( peopleDatabaseError, peopleDatabaseData ) => {
    if ( peopleDatabaseError ) {
        throw peopleDatabaseError;
    }
    const developers = {};

    peopleDatabaseData.rows.forEach( ( document ) => {
        if ( !developers[ document.doc.game ] ) {
            developers[ document.doc.game ] = [];
        }

        developers[ document.doc.game ].push( document.doc );
    } );

    gameDatabase.list( {
        // eslint-disable-next-line camelcase
        include_docs: true,
    }, ( gameDatabaseError, gameDatabaseData ) => {
        if ( gameDatabaseError ) {
            throw gameDatabaseError;
        }

        gameDatabaseData.rows.forEach( ( gameData ) => {
            const allGameData = Object.assign(
                {},
                {
                    _id: gameData._id,
                },
                gameData.doc
            );

            for ( let i = 0; i < developers[ allGameData._id ].length; i = i + 1 ) {
                const { _id, _rev, ...userData } = developers[ allGameData._id ][ i ];

                for ( const service in userData.accounts ) {
                    let providerName = service;
                    let provider;

                    if ( allGameData.config[ service ] && allGameData.config[ service ].type ) {
                        providerName = allGameData.config[ service ].type;
                    }

                    try {
                        provider = new indexers[ providerName ]( allGameData.config[ service ] || {}, userData );
                    } catch ( providerError ) {
                        console.error( `No indexer for ${ providerName } built yet, skipping` );

                        continue;
                    }

                    provider.loadRecentPosts()
                        .then( ( posts ) => {
                            for ( let i = 0; i < posts.length; i = i + 1 ) {
                                console.log( isValidPost( posts[ i ], allGameData.config[ service ] ) );
                                //database.insert( posts[ i ], posts[ i ].url );
                            }
                        } )
                        .catch( ( error ) => {
                            console.log( error );
                        } );
                }
            }
        } );
    } );
} );

// const miggyRSSParser = new MiggyRSS( 'https://miggy.org/games/elite-dangerous/devtracker/ed-dev-posts.rss' );
//
// miggyRSSParser.loadRecentPosts()
//     .then( ( posts ) => {
//         console.log( posts );
//     } )
//     .catch( ( error ) => {
//         console.log( error );
//     } );
