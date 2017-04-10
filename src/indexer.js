const path = require( 'path' );
const fs = require( 'fs' );

const Indexers = require( './modules/indexers/' );
const cache = require( './modules/cache.js' );
const datastore = require( './Datastore.js' );

const games = [
    'ark',
    'battlefield1',
    'conan',
    // 'csgo',
    'elite',
    'pubg',
    'rainbow6',
    'rimworld',
];

const INDEX_INTERVAL = 10;

console.log( `Indexer starting for ${ games.join( ', ' ) }` );
console.time( 'Indexer' );

const chunk = function chunk ( arr, len ) {
    const chunks = [];
    let i = 0;
    const n = arr.length;

    while ( i < n ) {
        chunks.push( arr.slice( i, i = i + len ) );
    }

    return chunks;
};

const storePosts = async function storePosts ( posts, filterData ) {
    for ( let i = 0; i < posts.length; i = i + 1 ) {
        await posts[ i ].save( filterData )
            .catch( ( error ) => {
                console.log( error );
            } );
    }
};

const indexGame = function indexGame( game, gameData ) {
    return new Promise( ( resolve, reject ) => {
        const developersByService = {};

        for ( let i = 0; i < gameData.developers.length; i = i + 1 ) {
            for ( const service in gameData.developers[ i ].accounts ) {
                if ( !developersByService[ service ] ) {
                    developersByService[ service ] = [];
                }

                developersByService[ service ].push( gameData.developers[ i ] );
            }
        }

        for ( const service in developersByService ) {
            let developerList = developersByService[ service ];
            let indexerIdentifier = service;
            let indexerConfig = {
                game: game,
            };

            if ( gameData.config[ service ]  ) {
                if ( gameData.config[ service ].type ) {
                    indexerIdentifier = gameData.config[ service ].type;
                }

                indexerConfig = Object.assign( {}, gameData.config[ service ], indexerConfig );
            }

            // If we don't have an indexer for this service, skip it
            if ( !Indexers[ indexerIdentifier ] ) {
                continue;
            }

            if ( developersByService[ service ] > 20 ) {
                const developerChunks = chunk( developersByService[ service ], Math.ceil( developersByService[ service ].length / INDEX_INTERVAL ) );

                developerList = developerChunks[ new Date().getMinutes() % INDEX_INTERVAL ];
            }

            // We don't have any developers for this specific minute
            if ( !developerList ) {
                continue;
            }

            // console.log( `Loading ${ developerList.length } developers on ${ service } for ${ game }` );
            console.time( `${ game }-${ service }` );

            const indexerPromises = [];

            for ( let i = 0; i < developerList.length; i = i + 1 ) {
                const {
                    accounts,
                    ...storeDeveloper
                } = developerList[ i ];

                storeDeveloper.identifier = accounts[ service ];
                const promise = Indexers[ indexerIdentifier ].loadRecentPosts( storeDeveloper, indexerConfig )
                    .then( ( posts ) => {
                        const filter = gameData.config[ service ] || false;

                        if ( posts ) {
                            storePosts( posts, filter );
                        }

                        return true;
                    } )
                    .catch( ( loadPostsError ) => {
                        console.log( loadPostsError );

                        return false;
                    } );

                    indexerPromises.push( promise );
            }

            Promise.all( indexerPromises )
                .then( () => {
                    console.log( service, Indexers[ indexerIdentifier ].load );
                    console.timeEnd( `${ game }-${ service }` );
                    resolve();
                } )
                .catch( ( indexerError ) => {
                    reject( indexerError );
                } );
        }
    } );
};

const run = function run () {
    return new Promise( ( resolve, reject ) => {
        datastore.getGames( games )
            .then( ( allGameData ) => {
                const gameIndexers = [];

                for ( let gameIndex = 0; gameIndex < games.length; gameIndex = gameIndex + 1 ) {
                    gameIndexers.push( indexGame( games[ gameIndex ], allGameData[ games[ gameIndex ] ] ) );
                }

                Promise.all( gameIndexers )
                    .then( () => {
                        resolve();
                    } )
                    .catch( ( error ) => {
                        reject( error );
                    } )
            } )
            .catch( ( error ) => {
                reject( error );
            } );
    } );
};

cache.clean()
    .then( async () => {
        await run();
        console.timeEnd( 'Indexer' );
    } )
    .catch( ( error ) => {
        throw error;
    } );
