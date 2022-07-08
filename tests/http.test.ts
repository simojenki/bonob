import { http, http2From, } from "../src/http";

describe("http", () => {
  const mockAxios = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  describe.each([
    ["baseURL"],
    ["url"],
    ["method"],
  ])('%s', (field) => {
    const getValue = (value: string) => {
      const thing = {} as any;
      thing[field] = value;
      return thing;
    };

    const base = http(mockAxios, getValue('base'));

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
      const firstLayer = http(base, getValue('level1'));
      const secondLayer = http(firstLayer, getValue('level2'));

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
    const base = http(mockAxios, { responseType: 'stream' });

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
      const firstLayer = http(base, { responseType: 'arraybuffer' });
      const secondLayer = http(firstLayer, { responseType: 'blob' });

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
    const base = http(mockAxios, getValues({ a: 1, b: 2, c: 3, d: 4 }));

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
      const firstLayer = http(base, getValues({ b: 22 }));
      const secondLayer = http(firstLayer, getValues({ c: 33 }));

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

describe("http2", () => {
  const mockAxios = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  describe.each([
    ["baseURL"],
    ["url"],
    ["method"],
  ])('%s', (field) => {
    const fieldWithValue = (value: string) => {
      const thing = {} as any;
      thing[field] = value;
      return thing;
    };

    const base = http2From(mockAxios).with(fieldWithValue('default'));

    describe("using default", () => {
      it("should use the default", () => {
        base({})
        expect(mockAxios).toHaveBeenCalledWith(fieldWithValue('default'));
      });
    });

    describe("overriding", () => {
      it("should use the override", () => {
        base(fieldWithValue('override'))
        expect(mockAxios).toHaveBeenCalledWith(fieldWithValue('override'));
      });
    });

    describe("wrapping", () => {
      const firstLayer = http2From(base).with(fieldWithValue('level1'));
      const secondLayer = firstLayer.with(fieldWithValue('level2'));

      describe("when the outter call provides a value", () => {
        it("should apply it", () => {
          secondLayer(fieldWithValue('outter'))
          expect(mockAxios).toHaveBeenCalledWith(fieldWithValue('outter'));
        });
      });

      describe("when the outter call does not provide a value", () => {
        it("should use the second layer", () => {
          secondLayer({ })
          expect(mockAxios).toHaveBeenCalledWith(fieldWithValue('level2'));
        });
      });
    });
  });

  describe("requestType", () => {
    const base = http2From(mockAxios).with({ responseType: 'stream' });

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
      const firstLayer = base.with({ responseType: 'arraybuffer' });
      const secondLayer = firstLayer.with({ responseType: 'blob' });

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
    const fieldWithValues = (values: any) => {
      const thing = {} as any;
      thing[field] = values;
      return thing;
    }
    const base = http2From(mockAxios).with(fieldWithValues({ a: 1, b: 2, c: 3, d: 4 }));

    describe("using default", () => {
      it("should use the default", () => {
        base({});
        expect(mockAxios).toHaveBeenCalledWith(fieldWithValues({ a: 1, b: 2, c: 3, d: 4 }));
      });
    });

    describe("overriding", () => {
      it("should use the override", () => {
        base(fieldWithValues({ b: 22, e: 5 }));
        expect(mockAxios).toHaveBeenCalledWith(fieldWithValues({ a: 1, b: 22, c: 3, d: 4, e: 5 }));
      });
    });

    describe("wrapping", () => {
      const firstLayer = base.with(fieldWithValues({ b: 22 }));
      const secondLayer = firstLayer.with(fieldWithValues({ c: 33 }));

      describe("when the outter call provides a value", () => {
        it("should apply it", () => {
          secondLayer(fieldWithValues({ a: 11, e: 5 }));
          expect(mockAxios).toHaveBeenCalledWith(fieldWithValues({ a: 11, b: 22, c: 33, d: 4, e: 5 }));
        });
      });

      describe("when the outter call does not provide a value", () => {
        it("should use the second layer", () => {
          secondLayer({ });
          expect(mockAxios).toHaveBeenCalledWith(fieldWithValues({ a: 1, b: 22, c: 33, d: 4 }));
        });
      });
    });
  })
});
