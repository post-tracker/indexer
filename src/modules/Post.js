const api = require( './api.js' );

class Post {
    isValid ( allowedSections, disallowedSections ) {
        if ( !this.text ) {
            console.error( 'Post has no text' );

            return false;
        }

        if ( this.text.length <= 0 ) {
            console.error( 'Post text too short' );

            return false;
        }

        if ( this.topicTitle.length <= 0 ) {
            console.error( 'Post title too short' );

            return false;
        }

        if ( allowedSections && allowedSections.length > 0 ) {
            if ( allowedSections.indexOf( this.section ) === -1 ) {
                // console.error( 'Post is not in an allowed section' );

                return false;
            }
        }

        if ( disallowedSections && disallowedSections.length > 0 ) {
            if ( disallowedSections.indexOf( this.section ) > -1 ) {
                // console.error( `Post is in an disallowed section (${ this.section })` );

                return false;
            }
        }

        return true;
    }

    async save ( game, allowedSections, disallowedSections ) {
        return new Promise( ( resolve, reject ) => {
            if ( !this.isValid( allowedSections, disallowedSections ) ) {
                resolve();

                return false;
            }

            const storeObject = {
                accountId: this.accountId,
                content: this.text,
                section: this.section,
                timestamp: this.timestamp,
                topic: this.topicTitle,
                topicUrl: this.topicUrl,
                url: this.url,
            };

            api.post( `/${ game }/posts`, storeObject )
                .then( () => {
                    // console.log( 'Post saved' );
                    resolve();
                } )
                .catch( ( error ) => {
                    reject( error );
                } );

            return true;
        } );
    }
}

module.exports = Post;
