const nano = require( 'nano' )( 'http://localhost:5984' );

const IPB = require( './modules/InvisionPowerboard.js' );

const database = nano.db.use( 'posts' );
const forumposts = new IPB( 'FWG', '9-pubg_fwg' );

forumposts.loadRecentPosts()
    .then( ( posts ) => {
        for ( let i = 0; i < posts.length; i = i + 1 ) {
            database.insert( posts[ i ], posts[ i ].url );
        }
    } )
    .catch( ( error ) => {
        console.log( error );
    } );
