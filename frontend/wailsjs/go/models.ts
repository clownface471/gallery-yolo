export namespace main {
	
	export class Book {
	    name: string;
	    cover: string;
	    tags: string[];
	    description: string;
	    is_locked: boolean;
	    is_hidden: boolean;
	    mask_cover: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Book(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.cover = source["cover"];
	        this.tags = source["tags"];
	        this.description = source["description"];
	        this.is_locked = source["is_locked"];
	        this.is_hidden = source["is_hidden"];
	        this.mask_cover = source["mask_cover"];
	    }
	}

}

