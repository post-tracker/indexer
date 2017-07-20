const fs = require( 'fs' );
const path = require( 'path' );

const chalk = require( 'chalk' );

const Indexers = require( './modules/indexers/' );
const cache = require( './modules/cache.js' );
const api = require( './modules/api.js' );
const load = require( './modules/load.js' );

const INDEX_INTERVAL = 10;
const SERVICE_ACCOUNT_CHUNK_CUTOFF = 20;
const LIMITED_SERVICES = [
    'Reddit',
];

// eslint-disable-next-line no-sync
const gameData = JSON.parse( fs.readFileSync( path.join( __dirname, '../config/games.json' ), 'utf-8' ) );

console.time( 'Indexer' );

process.on( 'exit', () => {
    console.timeEnd( 'Indexer' );
} );

const chunk = function chunk ( arr, len ) {
    const chunks = [];
    let i = 0;
    const n = arr.length;

    while ( i < n ) {
        chunks.push( arr.slice( i, i = i + len ) );
    }

    return chunks;
};

const indexGame = function indexGame ( game ) {
    return new Promise( ( resolve, reject ) => {
        const configuredServices = {};
        const {
            identifier,
            ...servicesConfig
        } = game;

        for ( const serviceIdentifier in servicesConfig ) {
            let indexerClass = serviceIdentifier;

            if ( servicesConfig[ serviceIdentifier ].type ) {
                indexerClass = servicesConfig[ serviceIdentifier ].type.replace( /\s/g, '' );
            }

            configuredServices[ serviceIdentifier ] = Object.assign( {}, servicesConfig[ serviceIdentifier ], {
                indexerType: indexerClass,
            } );
        }

        api.get( `/${ game.identifier }/accounts`, {
            active: 1,
        } )
        .then( ( accountResponse ) => {
            const accounts = accountResponse.data;

            api.get( `/${ game.identifier }/hashes` )
                .then( ( hashResponse ) => {
                    const hashes = hashResponse.data;
                    const serviceConfig = {};

                    for ( let i = 0; i < accounts.length; i = i + 1 ) {
                        let indexerType = false;

                        if ( configuredServices[ accounts[ i ].service ] && !Indexers[ configuredServices[ accounts[ i ].service ].indexerType ] ) {
                            console.log( chalk.red( `Found no indexer for "${ accounts[ i ].service }", skipping` ) );
                            continue;
                        } else if ( configuredServices[ accounts[ i ].service ] ) {
                            indexerType = configuredServices[ accounts[ i ].service ].indexerType;
                        } else if ( !configuredServices[ accounts[ i ].service ] && !Indexers[ accounts[ i ].service ] ) {
                            console.log( chalk.red( `Found no indexer for "${ accounts[ i ].service }", skipping` ) );
                            continue;
                        } else {
                            indexerType = accounts[ i ].service;
                        }

                        if ( !serviceConfig[ accounts[ i ].service ] ) {
                            serviceConfig[ accounts[ i ].service ] = {
                                developers: [],
                                indexerType: indexerType,
                            };
                        }

                        serviceConfig[ accounts[ i ].service ].developers.push( accounts[ i ] );
                    }

                    // eslint-disable-next-line guard-for-in
                    for ( const service in serviceConfig ) {
                        let developerList = serviceConfig[ service ].developers;

                        if ( LIMITED_SERVICES.indexOf( service ) > -1 && developerList.length > SERVICE_ACCOUNT_CHUNK_CUTOFF ) {
                            const developerChunks = chunk( serviceConfig[ service ].developers, Math.ceil( serviceConfig[ service ].developers.length / INDEX_INTERVAL ) );

                            developerList = developerChunks[ new Date().getMinutes() % INDEX_INTERVAL ];
                        }

                        // We don't have any developers for this specific minute
                        if ( !developerList || developerList.length < 1 ) {
                            continue;
                        }

                        // console.log( `Loading ${ developerList.length } developers on ${ service } for ${ game.identifier }` );
                        console.time( `${ game.identifier }-${ service }` );

                        const indexerPromises = [];

                        for ( let i = 0; i < developerList.length; i = i + 1 ) {
                            if ( !developerList[ i ].identifier || developerList[ i ].identifier.length < 1 ) {
                                console.error( `Got invalid identifer for ${ game.identifier } ${ service }. Got "${ developerList[ i ].identifer }"` );
                                continue;
                            }
                            const indexer = new Indexers[ serviceConfig[ service ].indexerType ]( developerList[ i ].identifier, configuredServices[ service ], hashes, load );
                            const promise = indexer.loadRecentPosts()
                                .then( ( posts ) => {
                                    let allowedSections = [];
                                    let disallowedSections = [];

                                    // console.log( `Got ${ posts.length } valid posts for ${ developerList[ i ].identifier } on ${ service }` )

                                    if ( configuredServices[ service ] && configuredServices[ service ].allowedSections ) {
                                        allowedSections = configuredServices[ service ].allowedSections;
                                    }

                                    if ( configuredServices[ service ] && configuredServices[ service ].disallowedSections ) {
                                        disallowedSections = configuredServices[ service ].disallowedSections;
                                    }

                                    posts.forEach( ( post ) => {
                                        post.accountId = developerList[ i ].id;
                                    } );

                                    if ( !posts || posts.length === 0 ) {
                                        return false;
                                    }

                                    for ( let postIndex = 0; postIndex < posts.length; postIndex = postIndex + 1 ) {
                                        if ( posts[ postIndex ].save ) {
                                            posts[ postIndex ].save( game.identifier, allowedSections, disallowedSections )
                                                .catch( ( error ) => {
                                                    console.log( posts[ postIndex ] );
                                                    console.log( error );
                                                } );
                                        } else {
                                            console.log( posts[ postIndex ] );
                                            reject( new Error( 'Post is missing save method' ) );
                                        }
                                    }

                                    return true;
                                } )
                                .catch( ( loadPostsError ) => {
                                    console.log( loadPostsError );

                                    resolve();
                                } );

                            indexerPromises.push( promise );
                        }

                        Promise.all( indexerPromises )
                            .then( () => {
                                console.timeEnd( `${ game.identifier }-${ service }` );
                                resolve();
                            } )
                            .catch( ( indexerError ) => {
                                reject( indexerError );
                            } );
                    }
                } )
                .catch( ( hashesError ) => {
                    reject( hashesError );
                } );
        } )
        .catch( ( error ) => {
            reject( error );
        } );
    } );
};


const run = function run () {
    const gamePromises = [];

    Object.keys( gameData ).forEach( ( gameIdentifier ) => {
        const currentGameData = Object.assign(
            {},
            gameData[ gameIdentifier ],
            {
                identifier: gameIdentifier,
            }
        );

        gamePromises.push( indexGame( currentGameData ) );
    } );

    Promise.all( gamePromises )
        .then( () => {
            console.log( load );
        } )
        .catch( ( error ) => {
            console.log( error );
        } );
};

cache.clean()
    .then( () => {
        run();
    } )
    .catch( ( error ) => {
        throw error;
    } );

process.on( 'unhandledRejection', ( r ) => {
    console.log( r );
} );
