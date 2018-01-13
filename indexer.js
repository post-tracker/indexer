const fs = require( 'fs' );
const path = require( 'path' );

const chalk = require( 'chalk' );
const pFinally = require( 'p-finally' );

require( 'dotenv' ).config();

const Indexers = require( './modules/indexers/' );
const cache = require( './modules/cache.js' );
const api = require( './modules/api.js' );
const load = require( './modules/load.js' );

const POST_LOOKBACK = 2;

console.time( 'Indexer' );

const counters = {
    accounts: 0,
    checked: 0,
    posts: 0,
    saved: 0,
    started: 0,
};

const indexService = function indexService ( serviceConfig, serviceOptions, gameIdentifier ) {
    console.time( `${ gameIdentifier }-${ serviceConfig.indexerType }` );

    const indexerPromises = [];

    counters.accounts = counters.accounts + serviceConfig.developers.length;

    for ( let i = 0; i < serviceConfig.developers.length; i = i + 1 ) {
        const indexer = new Indexers[ serviceConfig.indexerType ]( serviceConfig.developers[ i ].identifier, serviceOptions, load );


        indexerPromises.push( pFinally( indexer.loadRecentPosts()
            .then( async ( posts ) => {
                // Set the accountId on each post
                posts.forEach( ( post ) => {
                    post.accountId = serviceConfig.developers[ i ].id;
                    post.allowedSections = serviceOptions.allowedSections;
                    post.disallowedSections = serviceOptions.disallowedSections;
                } );

                counters.started = counters.started + 1;
                counters.posts = counters.posts + posts.length;

                if ( !posts || posts.length === 0 ) {
                    return false;
                }

                let postsAlreadyAdded = 0;

                for ( let postIndex = 0; postIndex < posts.length; postIndex = postIndex + 1 ) {
                    if ( !posts[ postIndex ].isValid() ) {
                        continue;
                    }
                    counters.checked = counters.checked + 1;
                    let exists;

                    try {
                        exists = await api.exists( posts[ postIndex ].url );
                    } catch ( apiError ) {
                        console.error( apiError );
                    }

                    if ( exists ) {
                        postsAlreadyAdded = postsAlreadyAdded + 1;
                        if ( postsAlreadyAdded >= POST_LOOKBACK ) {
                            break;
                        }

                        continue;
                    }

                    try {
                        await posts[ postIndex ].save( gameIdentifier )
                            .then( ( isSaved ) => {
                                if ( isSaved ) {
                                    console.log( posts[ postIndex ] );
                                    console.log( serviceOptions );
                                    counters.saved = counters.saved + 1;
                                }
                            } );
                    } catch ( error ) {
                        console.log( error );
                    }
                }

                return Promise.resolve();
            } ) ) );
    }

    return Promise.all( indexerPromises )
        .then( () => {
            console.timeEnd( `${ gameIdentifier }-${ serviceConfig.indexerType }` );
        } );
};

const indexGame = function indexGame ( game ) {
    const configuredServices = {};
    const {
        identifier,
        ...servicesConfig
    } = game;

    // eslint-disable-next-line guard-for-in
    for ( const serviceIdentifier in servicesConfig ) {
        let indexerClass = serviceIdentifier;

        if ( servicesConfig[ serviceIdentifier ].type ) {
            indexerClass = servicesConfig[ serviceIdentifier ].type.replace( /\s/g, '' );
        }

        configuredServices[ serviceIdentifier ] = Object.assign(
            {},
            servicesConfig[ serviceIdentifier ],
            {
                indexerType: indexerClass,
            }
        );
    }

    return api.get( `/${ game.identifier }/accounts`, {
        active: 1,
    } )
        .then( ( accountResponse ) => {
            const accounts = accountResponse.data;
            const serviceConfig = {};

            for ( let i = 0; i < accounts.length; i = i + 1 ) {
                let indexerType = false;

                if ( configuredServices[ accounts[ i ].service ] && !Indexers[ configuredServices[ accounts[ i ].service ].indexerType ] ) {
                    // console.log( chalk.red( `Found no indexer for "${ accounts[ i ].service }", skipping` ) );
                    continue;
                } else if ( configuredServices[ accounts[ i ].service ] ) {
                    indexerType = configuredServices[ accounts[ i ].service ].indexerType;
                } else if ( !configuredServices[ accounts[ i ].service ] && !Indexers[ accounts[ i ].service ] ) {
                    // console.log( chalk.red( `Found no indexer for "${ accounts[ i ].service }", skipping` ) );
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

            const servicesIndexers = [];

            // eslint-disable-next-line guard-for-in
            for ( const service in serviceConfig ) {
                servicesIndexers.push( pFinally( indexService( serviceConfig[ service ], configuredServices[ service ] || {}, identifier ) ) );
            }

            return Promise.all( servicesIndexers );
        } );
};


const run = function run () {
    const gamePromises = [];
    const indexerConfigs = [];

    api.get( '/games' )
        .then( ( gameData ) => {
            gameData.data.forEach( ( gameConfig ) => {
                if ( gameConfig.config && gameConfig.config.sources ) {
                    indexerConfigs.push( Object.assign(
                        {},
                        gameConfig.config.sources,
                        {
                            identifier: gameConfig.identifier,
                        }
                    ) );
                }
            } );

            indexerConfigs.forEach( ( currentGameData ) => {
                gamePromises.push( pFinally( indexGame( currentGameData ) ) );
            } );

            Promise.all( gamePromises )
                .then( () => {
                    console.log( load );
                    console.log( counters );
                    console.timeEnd( 'Indexer' );
                } )
                .catch( ( someError ) => {
                    console.error( someError );
                } );
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
