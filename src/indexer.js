const fs = require( 'fs' );

const sqlite3 = require( 'sqlite3' );

const Reddit = require( './modules/Reddit.js' );
const cache = require( './modules/cache.js' );

cache.clean();

const games = [
    'ark',
    'battlefield1',
    'csgo',
    'elite',
    'rainbow6',
    'rimworld',
];

console.log( `Indexer starting for ${ games.join( ',' ) }` );
console.time( 'Indexer' );

process.on( 'exit', () => {
    console.timeEnd( 'Indexer' );
} );

const storePosts = async function storePosts ( posts, databasePath, filterData ) {
    for ( let i = 0; i < posts.length; i = i + 1 ) {
        await posts[ i ].save( databasePath, filterData )
            .catch( ( error ) => {
                console.log( error );
            } );
    }
};

for ( let gameIndex = 0; gameIndex < games.length; gameIndex = gameIndex + 1 ) {
    const databasePath = `../dev-tracker/dist/${ games[ gameIndex ] }/data/database.sqlite`;
    const dataPath = `../dev-tracker/games/${ games[ gameIndex ] }/data.json`;
    const database = new sqlite3.Database( databasePath );

    // eslint-disable-next-line no-sync
    const gameData = JSON.parse( fs.readFileSync( dataPath, 'utf-8' ) );

    database.all( `SELECT
            developers.id,
            accounts.uid,
            accounts.identifier,
            developers.active
        FROM
            developers,
            accounts
        WHERE
            developers.active = 1
        AND
            developers.id = accounts.uid
        AND
            accounts.service = 'Reddit'`, ( error, developers ) => {
        if ( error ) {
            throw error;
        }

        for ( let i = 0; i < developers.length; i = i + 1 ) {
            const user = new Reddit( developers[ i ].uid, developers[ i ].identifier );

            user.loadRecentPosts()
                .then( ( ) => {
                    const filter = gameData.config.Reddit || false;

                    storePosts( user.postList, databasePath, filter );
                } )
                .catch( ( loadPostsError ) => {
                    console.log( loadPostsError );
                } );
        }
    } );

    database.close();
}
