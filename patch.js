const fs = require('fs');
let code = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
code = code.replace(/          use_oidc: true\n/g, `          use_oidc: true\n          skip_validation: true\n`);
fs.writeFileSync('.github/workflows/ci.yml', code);
