import url from "../src/url_builder";

describe("URLBuilder", () => {
  describe("construction", () => {
    it("with a string", () => {
      expect(url("http://example.com/").href()).toEqual("http://example.com/");
      expect(url("http://example.com/foobar?name=bob").href()).toEqual(
        "http://example.com/foobar?name=bob"
      );
    });

    it("with a URL", () => {
      expect(url(new URL("http://example.com/")).href()).toEqual(
        "http://example.com/"
      );
      expect(url(new URL("http://example.com/foobar?name=bob")).href()).toEqual(
        "http://example.com/foobar?name=bob"
      );
    });
  });

  describe("toString", () => {
    it("should print the href", () => {
      expect(`${url("http://example.com/")}`).toEqual("http://example.com/");
      expect(`${url("http://example.com/foobar?name=bob")}`).toEqual(
        "http://example.com/foobar?name=bob"
      );
    });
  });

  describe("path", () => {
    it("should be the pathname and search", () => {
      expect(url("http://example.com/").path()).toEqual("/");
      expect(url("http://example.com/?whoop=ie").path()).toEqual("/?whoop=ie");
      expect(url("http://example.com/foo/bar").path()).toEqual("/foo/bar");
      expect(url("http://example.com/with/search?q=bob&s=100").path()).toEqual("/with/search?q=bob&s=100");
      expect(url("http://example.com/drops/hash#1234").path()).toEqual("/drops/hash");
    });
  });

  describe("updating the pathname", () => {
    describe("appending", () => {
      describe("when there is no existing pathname", ()=>{
        it("should return a new URLBuilder with the new pathname appended to the existing pathname", () => {
          const original = url("https://example.com?a=b");
          const updated = original.append({ pathname: "/the-appended-path" });
    
          expect(original.href()).toEqual("https://example.com/?a=b");
          expect(original.pathname()).toEqual("/")
    
          expect(updated.href()).toEqual("https://example.com/the-appended-path?a=b");
          expect(updated.pathname()).toEqual("/the-appended-path")
        });
      });

      describe("when the existing pathname is /", ()=>{
        it("should return a new URLBuilder with the new pathname appended to the existing pathname", () => {
          const original = url("https://example.com/");
          const updated = original.append({ pathname: "/the-appended-path" });
    
          expect(original.href()).toEqual("https://example.com/");
          expect(original.pathname()).toEqual("/")
    
          expect(updated.href()).toEqual("https://example.com/the-appended-path");
          expect(updated.pathname()).toEqual("/the-appended-path")
        });
      });

      describe("when the existing pathname is /first-path", ()=>{
        it("should return a new URLBuilder with the new pathname appended to the existing pathname", () => {
          const original = url("https://example.com/first-path");
          const updated = original.append({ pathname: "/the-appended-path" });
    
          expect(original.href()).toEqual("https://example.com/first-path");
          expect(original.pathname()).toEqual("/first-path")
    
          expect(updated.href()).toEqual("https://example.com/first-path/the-appended-path");
          expect(updated.pathname()).toEqual("/first-path/the-appended-path")
        });
      });

      describe("when the existing pathname is /first-path/", ()=>{
        it("should return a new URLBuilder with the new pathname appended to the existing pathname", () => {
          const original = url("https://example.com/first-path/");
          const updated = original.append({ pathname: "/the-appended-path" });
    
          expect(original.href()).toEqual("https://example.com/first-path/");
          expect(original.pathname()).toEqual("/first-path/")
    
          expect(updated.href()).toEqual("https://example.com/first-path/the-appended-path");
          expect(updated.pathname()).toEqual("/first-path/the-appended-path")
        });
      });

      it("should return a new URLBuilder with the new pathname appended to the existing pathname", () => {
        const original = url("https://example.com/some-path?a=b");
        const updated = original.append({ pathname: "/some-new-path" });
  
        expect(original.href()).toEqual("https://example.com/some-path?a=b");
        expect(original.pathname()).toEqual("/some-path")
  
        expect(updated.href()).toEqual("https://example.com/some-path/some-new-path?a=b");
        expect(updated.pathname()).toEqual("/some-path/some-new-path")
      });
    });

    describe("replacing", () => {
      it("should return a new URLBuilder with the new pathname", () => {
        const original = url("https://example.com/some-path?a=b");
        const updated = original.with({ pathname: "/some-new-path" });
  
        expect(original.href()).toEqual("https://example.com/some-path?a=b");
        expect(original.pathname()).toEqual("/some-path")
  
        expect(updated.href()).toEqual("https://example.com/some-new-path?a=b");
        expect(updated.pathname()).toEqual("/some-new-path")
      });
    });
  });

  describe("updating search params", () => {
    describe("appending", () => {
      describe("with records", () => {
        it("should return a new URLBuilder with the new search params appended", () => {
          const original = url("https://example.com/some-path?a=b&c=d");
          const updated = original.append({
            searchParams: { x: "y", z: "1" },
          });
    
          expect(original.href()).toEqual("https://example.com/some-path?a=b&c=d");
          expect(`${original.searchParams()}`).toEqual("a=b&c=d")
    
          expect(updated.href()).toEqual("https://example.com/some-path?a=b&c=d&x=y&z=1");
          expect(`${updated.searchParams()}`).toEqual("a=b&c=d&x=y&z=1")
        });
      });

      describe("with URLSearchParams", () => {
        it("should return a new URLBuilder with the new search params appended", () => {
          const original = url("https://example.com/some-path?a=b&c=d");
          const searchParams = new URLSearchParams({ x: "y" });
          searchParams.append("z", "1");
          searchParams.append("z", "2");

          const updated = original.append({
            searchParams,
          });
    
          expect(original.href()).toEqual("https://example.com/some-path?a=b&c=d");
          expect(`${original.searchParams()}`).toEqual("a=b&c=d")
    
          expect(updated.href()).toEqual("https://example.com/some-path?a=b&c=d&x=y&z=1&z=2");
          expect(`${updated.searchParams()}`).toEqual("a=b&c=d&x=y&z=1&z=2")
        });
      });
    });

    describe("replacing", () => {
      describe("with records", () => {
        it("should be able to remove all search params", () => {
          const original = url("https://example.com/some-path?a=b&c=d");
          const updated = original.with({
            searchParams: {},
          });
    
          expect(original.href()).toEqual("https://example.com/some-path?a=b&c=d");
          expect(`${original.searchParams()}`).toEqual("a=b&c=d")
    
          expect(updated.href()).toEqual("https://example.com/some-path");
          expect(`${updated.searchParams()}`).toEqual("")
        });
    
        it("should return a new URLBuilder with the new search params", () => {
          const original = url("https://example.com/some-path?a=b&c=d");
          const searchParams = new URLSearchParams({ x: "y" });
          searchParams.append("z", "1");
          searchParams.append("z", "2");

          const updated = original.with({
            searchParams,
          });
    
          expect(original.href()).toEqual("https://example.com/some-path?a=b&c=d");
          expect(`${original.searchParams()}`).toEqual("a=b&c=d")
    
          expect(updated.href()).toEqual("https://example.com/some-path?x=y&z=1&z=2");
          expect(`${updated.searchParams()}`).toEqual("x=y&z=1&z=2")
        });
      });

      describe("with URLSearchParams", () => {
        it("should be able to remove all search params", () => {
          const original = url("https://example.com/some-path?a=b&c=d");
          const updated = original.with({
            searchParams: new URLSearchParams({}),
          });
    
          expect(original.href()).toEqual("https://example.com/some-path?a=b&c=d");
          expect(`${original.searchParams()}`).toEqual("a=b&c=d")
    
          expect(updated.href()).toEqual("https://example.com/some-path");
          expect(`${updated.searchParams()}`).toEqual("")
        });
    
        it("should return a new URLBuilder with the new search params", () => {
          const original = url("https://example.com/some-path?a=b&c=d");
          const searchParams = new URLSearchParams({ x: "y" });
          searchParams.append("z", "1");
          searchParams.append("z", "2");

          const updated = original.with({
            searchParams,
          });
    
          expect(original.href()).toEqual("https://example.com/some-path?a=b&c=d");
          expect(`${original.searchParams()}`).toEqual("a=b&c=d")
    
          expect(updated.href()).toEqual("https://example.com/some-path?x=y&z=1&z=2");
          expect(`${updated.searchParams()}`).toEqual("x=y&z=1&z=2")
        });
      });
    });
  });
});
