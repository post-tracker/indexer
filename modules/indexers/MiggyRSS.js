const RSS = require( './RSS.js' );

class MiggyRSS extends RSS {
    constructor ( userId, indexerConfig, load ) {
        super( userId, indexerConfig, load );

        this.userId = userId;
    }

    async loadRecentPosts () {
        let posts = false;

        try {
            posts = await super.loadRecentPosts();
        } catch ( postLoadError ) {
            console.error( postLoadError );
        }

        const validPosts = [];

        for ( let i = 0; i < posts.length; i = i + 1 ) {
            const [ , username, topicTitle, section ] = posts[ i ].topicTitle.match( /(.+?) - (.+?) \((.+?)\)/ );
            const [ , topicUrl ] = posts[ i ].url.match( /^(.+?)(\?p|$)/ );

            if ( username !== this.userId ) {
                continue;
            }

            posts[ i ].section = section;
            posts[ i ].topicTitle = topicTitle;
            posts[ i ].topicUrl = topicUrl;

            posts[ i ].text = posts[ i ].text.replace( /<a href=".+?">see more<\/a>/, '' ).trim();

            validPosts.push( posts[ i ] );
        }

        return validPosts;
    }
}

module.exports = MiggyRSS;
