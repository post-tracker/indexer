const RSS = require( './RSS.js' );

class MiggyRSS extends RSS {
    constructor ( providerConfig, userData ) {
        super( providerConfig );

        this.user = userData;
    }

    loadRecentPosts () {
        return new Promise( ( resolve, reject ) => {
            super.loadRecentPosts()
                .then( ( posts ) => {
                    const validPosts = [];

                    for ( let i = 0; i < posts.length; i = i + 1 ) {
                        const [ , username, topicTitle ] = posts[ i ].topic.match( /^(.+?) - (.*)/ );
                        const [ , topicUrl ] = posts[ i ].url.match( /^(.+?)(\?p|$)/ );

                        if ( username !== this.user.nick ) {
                            continue;
                        }

                        posts[ i ].topic = topicTitle;
                        posts[ i ].topicUrl = topicUrl;

                        posts[ i ].content = posts[ i ].content.replace( /<a href=".+?">see more<\/a>/, '' ).trim();

                        validPosts.push( Object.assign(
                            {},
                            this.user,
                            posts[ i ]
                        ) );
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
