const Post = require( '../Post.js' );

const TITLE_LENGTH = 60;
const IG_WEB_APP_ID = '936619743392459';

class Instagram {
    constructor ( userId, indexerConfig, load ) {
        this.apiBase = 'https://www.instagram.com';
        this.userId = userId;
        this.load = load;
    }

    async loadRecentPosts () {
        const url = `${ this.apiBase }/api/v1/users/web_profile_info/?username=${ encodeURIComponent( this.userId ) }`;
        const profileUrl = `${ this.apiBase }/${ this.userId }/`;
        const posts = [];
        let response;

        try {
            response = await this.load.get( url, {
                headers: {
                    'x-ig-app-id': IG_WEB_APP_ID,
                },
                isJSON: true,
            } );
        } catch ( pageLoadError ) {
            if ( pageLoadError.statusCode === 429 ) {
                console.error( `Instagram rate-limited request for ${ this.userId }` );
            } else {
                console.error( pageLoadError );
            }

            return posts;
        }

        const user = response && response.data && response.data.user;

        if ( !user || !user.edge_owner_to_timeline_media ) {
            return posts;
        }

        for ( const edge of user.edge_owner_to_timeline_media.edges ) {
            const node = edge.node;
            const captionEdge = node.edge_media_to_caption && node.edge_media_to_caption.edges[ 0 ];
            const caption = captionEdge ? captionEdge.node.text : '';
            const post = new Post();

            post.topicTitle = caption ? caption.slice( 0, TITLE_LENGTH ) : 'posted';
            post.topicUrl = profileUrl;
            post.url = `${ this.apiBase }/p/${ node.shortcode }/`;
            post.timestamp = node.taken_at_timestamp;
            post.text = `<img src="${ node.display_url }">${ caption }`;

            posts.push( post );
        }

        return posts;
    }
}

module.exports = Instagram;
