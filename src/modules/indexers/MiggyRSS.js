const RSS = require( './RSS.js' );

class MiggyRSS extends RSS {
    loadRecentPosts () {
        return new Promise( ( resolve, reject ) => {
            super.loadRecentPosts()
                .then( ( posts ) => {
                    for ( let i = 0; i < posts.length; i = i + 1 ) {
                        console.log( posts[ i ] );
                        const [ , username, topicTitle ] = posts[ i ].topic.match( /^(.+?) - (.*)/ );
                        const [ , topicUrl ] = posts[ i ].url.match( /^(.+?)(\?p|$)/ );

                        posts[ i ].topic = topicTitle;
                        posts[ i ].topicUrl = topicUrl;
                        posts[ i ].user = username;

                        posts[ i ].content = posts[ i ].content.replace( /<a href=".+?">see more<\/a>/, '' ).trim();
                    }

                    resolve( posts );
                } )
                .catch( ( error ) => {
                    reject( error );

                    return false;
                } );
        } );
    }
}

module.exports = MiggyRSS;
