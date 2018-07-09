const api = require( './api.js' );
const Notifyy = require( 'node-notifyy' );

let notifyy = new Notifyy( {
    users: process.env.NOTIFYY_USERS,
} );

class Post {
    isValid () {
        if ( this.timestamp > Math.floor( Date.now() / 1000 ) ) {
            notifyy.send( {
                title: 'Time traveling detected',
                message: 'A post from the future was detected',
                code: JSON.stringify( this, null, 4 ),
            } );

            return false;
        }

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

        if ( this.allowedSections && this.allowedSections.length > 0 ) {
            if ( this.allowedSections.indexOf( this.section ) === -1 ) {
                // console.error( 'Post is not in an allowed section' );

                return false;
            }
        }

        if ( this.disallowedSections && this.disallowedSections.length > 0 ) {
            if ( this.disallowedSections.indexOf( this.section ) > -1 ) {
                // console.error( `Post is in an disallowed section (${ this.section })` );

                return false;
            }
        }

        return true;
    }

    async save ( game ) {
        if ( !this.isValid() ) {
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

        return api.post( `/${ game }/posts`, storeObject );
    }
}

module.exports = Post;
