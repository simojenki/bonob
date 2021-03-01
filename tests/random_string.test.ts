import randomString from "../src/random_string";

describe('randomString', () => {
  it('should produce different strings...', () => {
    const s1 = randomString()
    const s2 = randomString()
    const s3 = randomString()
    const s4 = randomString()

    expect(s1.length).toEqual(64)
    
    expect(s1).not.toEqual(s2);
    expect(s1).not.toEqual(s3);
    expect(s1).not.toEqual(s4);
  });
});