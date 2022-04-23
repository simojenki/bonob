import {
  
  http2,
} from "../src/http";

// describe("request modifiers", () => {
//   describe("baseUrl", () => {
//     it.each([
//       [
//         { data: "bob" },
//         "http://example.com",
//         { data: "bob", baseURL: "http://example.com" },
//       ],
//       [
//         { baseURL: "http://originalBaseUrl.example.com" },
//         "http://example.com",
//         { baseURL: "http://example.com" },
//       ],
//     ])(
//       "should apply the baseUrl",
//       (requestConfig: any, value: string, expected: any) => {
//         expect(baseUrl(value)(requestConfig)).toEqual(expected);
//       }
//     );
//   });

//   describe("params", () => {
//     it.each([
//       [
//         { data: "bob" },
//         { param1: "value1", param2: "value2" },
//         { data: "bob", params: { param1: "value1", param2: "value2" } },
//       ],
//       [
//         { data: "bob", params: { orig1: "origValue1" } },
//         {},
//         { data: "bob", params: { orig1: "origValue1" } },
//       ],
//       [
//         { data: "bob", params: { orig1: "origValue1" } },
//         { param1: "value1", param2: "value2" },
//         {
//           data: "bob",
//           params: { orig1: "origValue1", param1: "value1", param2: "value2" },
//         },
//       ],
//     ])(
//       "should apply the params",
//       (requestConfig: any, newParams: any, expected: any) => {
//         expect(params(newParams)(requestConfig)).toEqual(expected);
//       }
//     );
//   });

//   describe("headers", () => {
//     it.each([
//       [
//         { data: "bob" },
//         { h1: "value1", h2: "value2" },
//         { data: "bob", headers: { h1: "value1", h2: "value2" } },
//       ],
//       [
//         { data: "bob", headers: { orig1: "origValue1" } },
//         {},
//         { data: "bob", headers: { orig1: "origValue1" } },
//       ],
//       [
//         { data: "bob", headers: { orig1: "origValue1" } },
//         { h1: "value1", h2: "value2" },
//         {
//           data: "bob",
//           headers: { orig1: "origValue1", h1: "value1", h2: "value2" },
//         },
//       ],
//     ])(
//       "should apply the headers",
//       (requestConfig: any, newParams: any, expected: any) => {
//         expect(headers(newParams)(requestConfig)).toEqual(expected);
//       }
//     );
//   });

//   describe("chain", () => {
//     it.each([
//       [
//         { data: "bob" },
//         [params({ param1: "value1", param2: "value2" })],
//         { data: "bob", params: { param1: "value1", param2: "value2" } },
//       ],
//       [
//         { data: "bob" },
//         [params({ param1: "value1" }), params({ param2: "value2" })],
//         { data: "bob", params: { param1: "value1", param2: "value2" } },
//       ],
//       [{ data: "bob" }, [], { data: "bob" }],
//     ])(
//       "should apply the chain",
//       (requestConfig: any, newParams: RequestModifier[], expected: any) => {
//         expect(chain(...newParams)(requestConfig)).toEqual(expected);
//       }
//     );
//   });

//   describe("wrapping", () => {
//     const mockAxios = jest.fn();

//     describe("baseURL", () => {
//       const base = http(
//         mockAxios,
//         baseUrl("http://original.example.com")
//       );

//       describe("when no baseURL passed in when being invoked", () => {
//         it("should use the original value", () => {
//           base({})
//           expect(mockAxios).toHaveBeenCalledWith({ baseURL: "http://original.example.com" });
//         });
//       });

//       describe("when a new baseURL is passed in when being invoked", () => {
//         it("should use the new value", () => {
//           base({ baseURL: "http://new.example.com" })
//           expect(mockAxios).toHaveBeenCalledWith({ baseURL: "http://new.example.com" });
//         });
//       });
//     });

//     describe("params", () => {
//       const base = http(
//         mockAxios,
//         params({ a: "1", b: "2" })
//       );

//       it("should apply the modified when invoked", () => {
//         base({ method: 'get' });
//         expect(mockAxios).toHaveBeenCalledWith({ method: 'get', params: { a: "1", b: "2" }});
//       });

//       describe("wrapping the base", () => {
//         const wrapped = http(base, params({ b: "2b", c: "3" }));

//         it("should the wrapped values as priority", () => {
//           wrapped({ method: 'get', params: { a: "1b", c: "3b", d: "4" } });
//           expect(mockAxios).toHaveBeenCalledWith({ method: 'get', params: { a: "1b", b: "2b", c: "3b", d: "4" }});
//         });
//       });
//     });
//   });
// });

describe("http2", () => {
  const mockAxios = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  describe.each([
    ["baseURL"],
    ["url"],
  ])('%s', (field) => {
    const getValue = (value: string) => {
      const thing = {} as any;
      thing[field] = value;
      return thing;
    };

    const base = http2(mockAxios, getValue('base'));

    describe("using default", () => {
      it("should use the default", () => {
        base({})
        expect(mockAxios).toHaveBeenCalledWith(getValue('base'));
      });
    });

    describe("overriding", () => {
      it("should use the override", () => {
        base(getValue('override'))
        expect(mockAxios).toHaveBeenCalledWith(getValue('override'));
      });
    });

    describe("wrapping", () => {
      const firstLayer = http2(base, getValue('level1'));
      const secondLayer = http2(firstLayer, getValue('level2'));

      describe("when the outter call provides a value", () => {
        it("should apply it", () => {
          secondLayer(getValue('outter'))
          expect(mockAxios).toHaveBeenCalledWith(getValue('outter'));
        });
      });

      describe("when the outter call does not provide a value", () => {
        it("should use the second layer", () => {
          secondLayer({ })
          expect(mockAxios).toHaveBeenCalledWith(getValue('level2'));
        });
      });
    });
  });

  describe("requestType", () => {
    const base = http2(mockAxios, { responseType: 'stream' });

    describe("using default", () => {
      it("should use the default", () => {
        base({})
        expect(mockAxios).toHaveBeenCalledWith({ responseType: 'stream' });
      });
    });

    describe("overriding", () => {
      it("should use the override", () => {
        base({ responseType: 'arraybuffer' })
        expect(mockAxios).toHaveBeenCalledWith({ responseType: 'arraybuffer' });
      });
    });

    describe("wrapping", () => {
      const firstLayer = http2(base, { responseType: 'arraybuffer' });
      const secondLayer = http2(firstLayer, { responseType: 'blob' });

      describe("when the outter call provides a value", () => {
        it("should apply it", () => {
          secondLayer({ responseType: 'text' })
          expect(mockAxios).toHaveBeenCalledWith({ responseType: 'text' });
        });
      });

      describe("when the outter call does not provide a value", () => {
        it("should use the second layer", () => {
          secondLayer({ })
          expect(mockAxios).toHaveBeenCalledWith({ responseType: 'blob' });
        });
      });
    });
  });  

  describe.each([
    ["params"],
    ["headers"],
  ])('%s', (field) => {
    const getValues = (values: any) => {
      const thing = {} as any;
      thing[field] = values;
      return thing;
    }
    const base = http2(mockAxios, getValues({ a: 1, b: 2, c: 3, d: 4 }));

    describe("using default", () => {
      it("should use the default", () => {
        base({});
        expect(mockAxios).toHaveBeenCalledWith(getValues({ a: 1, b: 2, c: 3, d: 4 }));
      });
    });

    describe("overriding", () => {
      it("should use the override", () => {
        base(getValues({ b: 22, e: 5 }));
        expect(mockAxios).toHaveBeenCalledWith(getValues({ a: 1, b: 22, c: 3, d: 4, e: 5 }));
      });
    });

    describe("wrapping", () => {
      const firstLayer = http2(base, getValues({ b: 22 }));
      const secondLayer = http2(firstLayer, getValues({ c: 33 }));

      describe("when the outter call provides a value", () => {
        it("should apply it", () => {
          secondLayer(getValues({ a: 11, e: 5 }));
          expect(mockAxios).toHaveBeenCalledWith(getValues({ a: 11, b: 22, c: 33, d: 4, e: 5 }));
        });
      });

      describe("when the outter call does not provide a value", () => {
        it("should use the second layer", () => {
          secondLayer({ });
          expect(mockAxios).toHaveBeenCalledWith(getValues({ a: 1, b: 22, c: 33, d: 4 }));
        });
      });
    });
  })
});
