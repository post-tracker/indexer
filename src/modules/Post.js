const datastore = require( '../Datastore.js' );

class Post extends Object {
    isValid ( filterData ) {
        if ( this.text.length <= 0 ) {
            return false;
        }

        // Filter for specific forums if we want
        if ( filterData && filterData.matchOnly ) {
            if ( !Array.isArray( filterData.matchOnly ) ) {
                filterData.matchOnly = [ filterData.matchOnly ];
            }

            if ( filterData.matchOnly.indexOf( this.section ) === -1 ) {
                return false;
            }
        }

        // Filter for specific forums if we want
        if ( filterData && filterData.exclude ) {
            if ( !Array.isArray( filterData.exclude ) ) {
                filterData.exclude = [ filterData.exclude ];
            }

            if ( filterData.exclude.indexOf( this.section ) > -1  ) {
                return false;
            }
        }

        return true;
    }

    async save ( databasePath, filterData ) {
        if ( !this.isValid( filterData ) ) {
            return false;
        }
        
        datastore.storePost(  {
            content: this.text,
            game: this.game,
            group: this.group,
            identifier: this.identifier,
            nick: this.nick,
            role: this.role,
            section: this.section,
            source: this.source,
            timestamp: this.timestamp,
            topic: this.topicTitle,
            topicUrl: this.topicUrl,
            url: this.url,
        } );

        return true;
    }
}

module.exports = Post;
