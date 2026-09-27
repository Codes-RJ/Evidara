import { mkdirSync, copyFileSync, cpSync, readFileSync, writeFileSync } from 'node:fs';

// Serve version-locked fonts/icons/graph code locally. Recreated by build after npm ci.
const root = new URL('../', import.meta.url);
const output = new URL('public/vendor/', root);
mkdirSync(output, { recursive: true });
mkdirSync(new URL('files/', output), { recursive: true });
let fontCss = '';
for (const weight of [400, 500, 600, 700]) {
    fontCss += readFileSync(
        new URL(`node_modules/@fontsource/inter/latin-${weight}.css`, root),
        'utf8',
    );
    for (const extension of ['woff', 'woff2'])
        copyFileSync(
            new URL(
                `node_modules/@fontsource/inter/files/inter-latin-${weight}-normal.${extension}`,
                root,
            ),
            new URL(`files/inter-latin-${weight}-normal.${extension}`, output),
        );
}
writeFileSync(new URL('inter.css', output), fontCss);
cpSync(
    new URL('node_modules/@phosphor-icons/web/src/regular/', root),
    new URL('phosphor/regular/', output),
    { recursive: true },
);
copyFileSync(
    new URL('node_modules/vis-network/standalone/umd/vis-network.min.js', root),
    new URL('vis-network.min.js', output),
);
for (const [packageName, filename] of [
    ['@fontsource/inter', 'inter-LICENSE'],
    ['@phosphor-icons/web', 'phosphor-LICENSE'],
]) {
    copyFileSync(new URL(`node_modules/${packageName}/LICENSE`, root), new URL(filename, output));
}
console.log('Built local Inter, Phosphor icons, and vis-network assets.');
for (const license of ['LICENSE-MIT', 'LICENSE-APACHE-2.0'])
    copyFileSync(
        new URL(`node_modules/vis-network/${license}`, root),
        new URL(`vis-network-${license}`, output),
    );
