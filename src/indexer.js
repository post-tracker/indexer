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


            if ( !developers[ allGameData._id ] ) {
                // If we haven't added any developers, there is nothing to index

                return true;
            }

            for ( let i = 0; i < developers[ allGameData._id ].length; i = i + 1 ) {
                const {
                    _id,
                    _rev,
                    accounts,
                    ...userData
                } = developers[ allGameData._id ][ i ];

                for ( const service in accounts ) {
                    if ( !Reflect.apply( {}.hasOwnProperty, accounts, [ service ] ) ) {
                        continue;
                    }

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
                            const validPosts = [];

                            for ( let postIndex = 0; postIndex < posts.length; postIndex = postIndex + 1 ) {
                                if ( !isValidPost( posts[ postIndex ], allGameData.config[ service ] ) ) {
                                    continue;
                                }

                                posts[ postIndex ]._id = posts[ postIndex ].url;

                                validPosts.push( posts[ postIndex ] );
                            }

                            postDatabase.bulk( {
                                docs: validPosts,
                            }, ( error ) => {
                                if ( error ) {
                                    throw error;
                                }
                            } );
                        } )
                        .catch( ( error ) => {
                            console.log( error );
                        } );
                }
            }

            return true;
        } );
    } );
} );
