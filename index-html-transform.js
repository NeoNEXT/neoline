const fs = require('fs');
const node_path = require('path');

const addScript = (path)=>{
    return `<script src="${path}"></script>`
}
module.exports = (targetOptions, indexHtml) =>{
    const vendor_path = node_path.resolve(__dirname+`/dist`);
    let vendorScripts = ``;
    fs.readdirSync(vendor_path).forEach((file)=>{
        if(file.indexOf('ledger')===0 || file.indexOf('neonjs')===0){
                vendorScripts+=addScript(file);
        }
    });

    const mainScriptStr = `<neo-line></neo-line>`;
    const mainIndex = indexHtml.indexOf(mainScriptStr) + mainScriptStr.length;

    return `${indexHtml.slice(0,mainIndex)}
            ${vendorScripts}
            ${indexHtml.slice(mainIndex)}`;
}