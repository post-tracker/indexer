const RSS = require( './RSS.js' );

class MiggyRSS extends RSS {
    constructor ( userId, indexerConfig, load ) {
        super( userId, indexerConfig, load );

        this.userId = userId;
    }

    loadRecentPosts () {
        return new Promise( ( resolve, reject ) => {
            super.loadRecentPosts()
                .then( ( posts ) => {
                    const validPosts = [];

                    for ( let i = 0; i < posts.length; i = i + 1 ) {
                        const [ , username, topicTitle ] = posts[ i ].topicTitle.match( /^(.+?) - (.*)/ );
                        const [ , topicUrl ] = posts[ i ].url.match( /^(.+?)(\?p|$)/ );

                        if ( username !== this.userId ) {
                            continue;
                        }

                        posts[ i ].topicTitle = topicTitle;
                        posts[ i ].topicUrl = topicUrl;

                        posts[ i ].text = posts[ i ].text.replace( /<a href=".+?">see more<\/a>/, '' ).trim();

                        validPosts.push( posts[ i ] );
                    }

                    resolve( validPosts );
                } )
                .catch( ( error ) => {
                    reject( error );

                    return false;
                } );
        } );
    }
}

module.exports = MiggyRSS;
