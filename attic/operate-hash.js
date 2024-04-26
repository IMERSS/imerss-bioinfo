hortis.intKey = new Uint8Array(8);
hortis.intValue = new Uint8Array(4);

// Adapted from https://stackoverflow.com/a/12965194 by reversing bytes
hortis.writeLong = function (target, long) {
    for (let index = target.length - 1; index >= 0; --index) {
        const byte = long & 0xff;
        target [ index ] = byte;
        long = (long - byte) / 256;
    }
};

hortis.readLong = function (source) {
    let value = 0;
    for (let i = 0; i < source.length; ++i) {
        value = (value * 256) + source[i];
    }
    return value;
};

hortis.getHashCount = function (hash, key) {
    hortis.writeLong(hortis.intKey, key);
    const found = hash.get(hortis.intKey, 0, hortis.intValue, 0);
    return found === 1 ? hortis.readLong(hortis.intValue) : undefined;
};

hortis.addHashCount = function (hash, key, count = 1) {
    const existing = hortis.getHashCount(hash, key);
    hortis.writeLong(hortis.intValue, existing === undefined ? count : existing + count);
    hortis.writeLong(hortis.intKey, key);
    hash.set(hortis.intKey, 0, hortis.intValue, 0);
};