const fs = require( 'fs' );
const path = require( 'path' );

const sqlite3 = require( 'sqlite3' );

const Indexers = require( './modules/indexers/' );

const cache = require( './modules/cache.js' );

cache.clean();

const games = [
    'ark',
    'battlefield1',
    'conan',
    'csgo',
    'elite',
    'pubg',
    'rainbow6',
    'rimworld',
];

const INDEX_INTERVAL = 6;

console.log( `Indexer starting for ${ games.join( ', ' ) }` );
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

const storePosts = async function storePosts ( posts, databasePath, filterData ) {
    for ( let i = 0; i < posts.length; i = i + 1 ) {
        await posts[ i ].save( databasePath, filterData )
            .catch( ( error ) => {
                console.log( error );
            } );
    }
};

for ( let gameIndex = 0; gameIndex < games.length; gameIndex = gameIndex + 1 ) {
    const databasePath = path.join( __dirname, `../../dev-tracker/dist/${ games[ gameIndex ] }/data/database.sqlite` );
    const dataPath = path.join( __dirname, `../../dev-tracker/games/${ games[ gameIndex ] }/data.json` );
    const database = new sqlite3.Database( databasePath );

    // eslint-disable-next-line no-sync
    const gameData = JSON.parse( fs.readFileSync( dataPath, 'utf-8' ) );

    database.all( `SELECT
            developers.id,
            accounts.uid,
            accounts.identifier,
            accounts.service,
            developers.active
        FROM
            developers,
            accounts
        WHERE
            developers.active = 1
        AND
            developers.id = accounts.uid`, ( error, developers ) => {
        if ( error ) {
            throw error;
        }

        database.all( 'SELECT url FROM posts', ( postsError, postRows ) => {
            if ( postsError ) {
                throw postsError;
            }

            const urlList = [];
            const developersByService = {};

            for ( let i = 0; i < postRows.length; i = i + 1 ) {
                urlList.push( postRows[ i ].url );
            }

            for ( let i = 0; i < developers.length; i = i + 1 ) {
                if ( !Indexers[ developers[ i ].service ] ) {
                    // console.log( `Found no indexer for ${ developers[ i ].service }, skipping ` );
                    continue;
                }

                if ( !developersByService[ developers[ i ].service ] ) {
                    developersByService[ developers[ i ].service ] = [];
                }

                developersByService[ developers[ i ].service ].push( developers[ i ] );
            }

            for ( const service in developersByService ) {
                let developerList = developersByService[ service ];

                if ( service === 'Reddit' ) {
                    const developerChunks = chunk( developersByService[ service ], Math.ceil( developersByService[ service ].length / INDEX_INTERVAL ) );

                    developerList = developerChunks[ new Date().getMinutes() % INDEX_INTERVAL ];
                }

                // We don't have any developers for this specific minute
                if ( !developerList ) {
                    continue;
                }

                // console.log( `Loading ${ developerList.length } developers on ${ service } for ${ games[ gameIndex ] }` );
                console.time( `${ games[ gameIndex ] }-${ service }` );

                const indexerPromises = [];

                for ( let i = 0; i < developerList.length; i = i + 1 ) {
                    const promise = Indexers[ service ].loadRecentPosts( developerList[ i ].uid, developerList[ i ].identifier, urlList )
                        .then( ( posts ) => {
                            const filter = gameData.config[ service ] || false;

                            if ( posts ) {
                                storePosts( posts, databasePath, filter );
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
                        // console.log( service, Indexers[ service ].load );
                        // console.timeEnd( `${ games[ gameIndex ] }-${ service }` );
                    } )
                    .catch( ( indexerError ) => {
                        throw indexerError;
                    } );
            }
        } );
    } );

    database.close();
}
