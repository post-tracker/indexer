class BBCode {
    constructor () {
        this.converters = [];
        this.plainTags = {
            b: 'b',
            i: 'i',
            quote: 'blockquote',
            u: 'u',
            url: 'url',
        };

        this.converters.push(
            ( string ) => {
                let parsedString = string;

                for ( const search in this.plainTags ) {
                    const matchPattern = `\\[${ search }\\]([\\s\\S]+?)\\[\\/${ search }\\]`;
                    const matcher = new RegExp( matchPattern, 'g' );

                    parsedString = parsedString.replace( matcher, `<${ this.plainTags[ search ] }>$1</${ this.plainTags[ search ] }>` );
                }

                return parsedString;
            }
        );

        this.converters.push(
            ( string ) => {
                // Converts bbcodes that look like [url=*url*]title[/url]
                return string.replace( /\[url=(.+?)]([\s\S]+?)\[\/url]/g, '<a href="$1">$2</a>' );
            }
        );

        this.converters.push(
            ( string ) => {
                // Converts bbcodes that look like [img]*url*[/img]
                return string.replace( /\[img]([\s\S]+?)\[\/img]/g, '<img href="$1">' );
            }
        );

        this.converters.push(
            ( string ) => {
                // Fix spoilers
                return string.replace( /\[spoiler]([\s\S]+?)\[\/spoiler]/g, '<div class="bb-spoiler-toggle"><button>Show spoiler</button></div><div class="bb-spoiler">$2</div>' );
            }
        );
    }

    nl2br ( string ) {
        return string.replace( /(\r\n|\n|\r)/gm, '<br>' );
    }

    findMissingTags ( string ) {
        const match = string.match( /\[.+?\]/g );

        if ( match ) {
            return match;
        }

        return false;
    }

    parse ( rawString ) {
        let parsedString = rawString;

        parsedString = this.nl2br( parsedString );

        for ( let i = 0; i < this.converters.length; i = i + 1 ) {
            parsedString = this.converters[ i ]( parsedString );
        }

        // const missingTags = this.findMissingTags( parsedString );
        //
        // if ( missingTags ) {
        //     console.log( missingTags );
        // }

        return parsedString;
    }
}

module.exports = new BBCode();
