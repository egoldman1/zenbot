const { chromium } = require(process.argv[2] || 'playwright');
const fs = require('fs');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({headless:true,executablePath:process.argv[3] || undefined});
 try {
 const page = await browser.newPage({viewport:{width:1024,height:768}});
 const rail = (id,display) => `<div id="ticket-${id}" style="display:${display};position:absolute;right:0;top:60px;width:480px;height:708px"><aside data-test-id="omnipanel-pane-wrapper-apps" style="position:absolute;right:60px;top:0;width:${id===123?420:320}px;height:628px;background:#fafafa"></aside><section style="position:absolute;right:0;top:0;width:60px;height:708px;overflow:hidden;transform:translateZ(0)"><div data-test-id="omnipanel-selector-wrapper"><ul><li><button data-test-id="omnipanel-selector-item-apps">Apps</button></li></ul></div></section></div>`;

 const html = `<html><body style="margin:0"><h1>Zendesk layout fixture</h1>${rail(123,'block')}${rail(456,'none')}<footer style="position:fixed;bottom:0;right:64px;height:49px;width:400px;background:white"><button id="submit-ticket" style="position:absolute;right:20px;bottom:12px" onclick="this.dataset.clicked='yes'">Submit ticket</button></footer></body></html>`;
 await page.route('https://fixture.zendesk.com/**', route=>route.fulfill({contentType:'text/html',body:html}));
 await page.goto('https://fixture.zendesk.com/agent/tickets/123');
 const panelHtml=fs.readFileSync('panel.html','utf8');
 const manifest=JSON.parse(fs.readFileSync('manifest.json','utf8'));
 await page.evaluate(({panelHtml,manifest})=>{ window.fetch=async()=>({ok:true,text:async()=>panelHtml}); window.chrome={runtime:{getURL:p=>p,getManifest:()=>manifest},storage:{local:{get:async()=>({zenbotSettings:{autoSummarize:false}})}}};},{panelHtml,manifest});
 await page.addStyleTag({content:fs.readFileSync('panel.css','utf8')});
 await page.addScriptTag({content:fs.readFileSync('settings-info.js','utf8')});
 await page.addScriptTag({content:fs.readFileSync('content.js','utf8')});
 await page.locator('#ticket-123 .zenbot-omnipanel-item button').click();
 let panel=page.locator('.zenbot-panel:visible');
 await panel.waitFor();
 assert.equal(await panel.locator("[data-zenbot-version]").textContent(),`v${manifest.version}`);
 const bounds=await panel.boundingBox();
 assert.equal(bounds.width,420); assert.ok(bounds.x>=0 && bounds.x+bounds.width<=1024);
 assert.equal(await panel.evaluate(e=>e.parentElement===document.body),true);
 assert.equal(bounds.y+bounds.height,719, 'Match measured toolbar top, extending 31px beyond the former 80px allowance');
 await page.locator('#submit-ticket').click();
 assert.equal(await page.locator('#submit-ticket').getAttribute('data-clicked'),'yes', 'Bottom button remains clickable while Zenbot is open');
 // A body-level status dropdown must remain clickable above the action bar.
 await panel.locator('#zenbot-note').fill('Keep my draft while choosing status');
 await page.evaluate(()=>{
   const menu=document.createElement('div');
   menu.id='status-menu';menu.setAttribute('role','menu');
   menu.style.cssText='position:fixed;right:64px;bottom:49px;width:220px;height:200px;background:white;z-index:1000';
   menu.innerHTML='<button role="menuitem" onclick="this.parentElement.remove()">Pending</button>';
   document.body.append(menu);
 });
 await page.waitForFunction(()=>document.querySelector('.zenbot-panel[style*="display: block"]').getBoundingClientRect().bottom===519);
 await page.getByRole('menuitem',{name:'Pending',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.zenbot-panel[style*="display: block"]').getBoundingClientRect().bottom===719);
 assert.equal(await panel.locator('#zenbot-note').inputValue(),'Keep my draft while choosing status');
 // Simulate Zendesk's delegated rail handler and native customer toggle.
 await page.evaluate(()=>{
   const ticket=document.querySelector('#ticket-123');
   const list=ticket.querySelector('ul');
   const item=document.createElement('li');
   item.innerHTML='<button id="customer-toggle">Customer</button>';
   list.prepend(item);
   ticket.dataset.nativeClicks='0';
   list.addEventListener('click',()=>{
     ticket.dataset.nativeClicks=String(Number(ticket.dataset.nativeClicks)+1);
     const pane=ticket.querySelector('aside');
     pane.style.display=pane.style.display==='none'?'block':'none';
   });
   item.querySelector('button').addEventListener('click',()=>{
     ticket.dataset.zenbotClosedBeforeCustomer=String(![...document.querySelectorAll('.zenbot-panel')].some(p=>p.style.display==='block'));
   });
 });
 for (let cycle=0;cycle<3;cycle++) {
   await page.locator('#customer-toggle').click();
   assert.equal(await page.locator('.zenbot-panel:visible').count(),0);
   assert.equal(await page.locator('#ticket-123').getAttribute('data-zenbot-closed-before-customer'),'true');
   await page.locator('#ticket-123 .zenbot-omnipanel-item button').click();
   assert.equal(await page.locator('#ticket-123').getAttribute('data-native-clicks'),String(cycle+1),'Zenbot clicks must not toggle native panes');
   await panel.locator('#zenbot-note').fill('Keep my draft while choosing status');
   const reopened=await panel.boundingBox();
   const railBounds=await page.locator('#ticket-123 section').boundingBox();
   assert.ok(reopened.width>=400 && reopened.x+reopened.width<=railBounds.x,'Reopened panel stays beside the rail and accepts input');
 }
 await page.locator('footer').evaluate(e=>{e.style.height='72px';});
 await page.waitForFunction(()=>document.querySelector('.zenbot-panel[style*="display: block"]').getBoundingClientRect().bottom===document.querySelector('footer').getBoundingClientRect().top);
 assert.equal((await panel.boundingBox()).y+(await panel.boundingBox()).height,696);
 await page.locator('footer').evaluate(e=>{e.style.height='49px';});
 await page.waitForFunction(()=>document.querySelector('.zenbot-panel[style*="display: block"]').getBoundingClientRect().bottom===719);
 await panel.locator('#zenbot-note').fill('First ticket note');
 await page.evaluate(()=>{document.querySelector('#ticket-123').style.display='none';document.querySelector('#ticket-456').style.display='block';history.pushState({},'', '/agent/tickets/456');});
 await page.locator('#ticket-456 .zenbot-omnipanel-item button').click();
 panel=page.locator('.zenbot-panel:visible');
 await panel.waitFor();
 assert.equal(await panel.count(),1);
 assert.equal((await panel.boundingBox()).width,320);
 await page.locator('#ticket-456 aside').evaluate(e=>{e.style.width='510px';});
 await page.waitForFunction(()=>document.querySelector('.zenbot-panel[style*="display: block"]').getBoundingClientRect().width===510);
 const menuBounds=await page.locator('#ticket-456 aside').boundingBox();
 const resizedBounds=await panel.boundingBox();
 assert.equal(resizedBounds.x,menuBounds.x);
 assert.equal(resizedBounds.width,menuBounds.width);
 const secondBounds=await panel.boundingBox();
 assert.equal(secondBounds.y+secondBounds.height,719);
 await page.setViewportSize({width:1024,height:500});
 await page.waitForFunction(()=>{
   const box=document.querySelector('.zenbot-panel[style*="display: block"]').getBoundingClientRect();
   return box.bottom===document.querySelector('footer').getBoundingClientRect().top;
 });
 await page.locator('#submit-ticket').click();
 await page.setViewportSize({width:1024,height:768});
 assert.equal(await panel.locator('#zenbot-note').inputValue(),'');
 await panel.locator('#zenbot-note').fill('Second ticket note');

 await page.evaluate(()=>{document.querySelector('#ticket-456').style.display='none';document.querySelector('#ticket-123').style.display='block';history.pushState({},'', '/agent/tickets/123');});
 await page.locator('#ticket-123 .zenbot-omnipanel-item button').click();
 await page.locator('.zenbot-panel:visible').waitFor();
 assert.equal(await page.locator('.zenbot-panel:visible #zenbot-note').inputValue(),'First ticket note');
 // Zendesk may keep the same sidebar node while changing the ticket route.
 await page.evaluate(()=>{history.pushState({},'', '/agent/tickets/789');window.dispatchEvent(new PopStateEvent('popstate'));});
 await page.waitForFunction(()=>![...document.querySelectorAll('.zenbot-panel')].some(e=>e.style.display==='block'));
 await page.locator('#ticket-123 .zenbot-omnipanel-item button').click();
 assert.equal(await page.locator('.zenbot-panel:visible #zenbot-note').inputValue(),'', 'A reused sidebar must not carry a draft to a different ticket');
 await page.locator('.zenbot-panel:visible #zenbot-note').fill('Third ticket note');
 await page.evaluate(()=>{history.pushState({},'', '/agent/tickets/123');window.dispatchEvent(new PopStateEvent('popstate'));});
 await page.waitForFunction(()=>![...document.querySelectorAll('.zenbot-panel')].some(e=>e.style.display==='block'));
 await page.locator('#ticket-123 .zenbot-omnipanel-item button').click();
 assert.equal(await page.locator('.zenbot-panel:visible #zenbot-note').inputValue(),'First ticket note', 'Restore the original ticket draft after reusing its sidebar');
 await page.locator('.zenbot-panel:visible #zenbot-close').click();
 assert.equal(await page.locator('.zenbot-panel:visible').count(),0);
 const {replyHtml}=await import('./rich-text.mjs');
 const text=(text,bold=false,italic=false,href=null)=>({text,bold,italic,href});
 const listItems=[{spans:[text('First item')]},{spans:[text('Second item')]}];
 const formatted=replyHtml({blocks:[
   {type:'paragraph',spans:[text('Bold',true),text(' and '),text('italic',false,true)]},
   {type:'bulleted_list',spaced:true,items:listItems},
   {type:'numbered_list',spaced:false,items:listItems},
   {type:'paragraph',spans:[text('Vehicle PR code guide',false,false,'https://example.com/guide?part=1&vehicle=2')]},
   {type:'paragraph',spans:[text('AB123CD',true,true)]},
 ]});
 await page.evaluate(html=>{
   const preview=document.createElement('div');preview.id='rich-preview';
   preview.style.cssText='position:fixed;left:16px;top:160px;width:400px;background:white;line-height:20px';
   preview.innerHTML=html;document.body.append(preview);
 },formatted);
 assert.equal(await page.locator('#rich-preview strong').first().textContent(),'Bold');
 assert.equal(await page.locator('#rich-preview em').first().textContent(),'italic');
 assert.equal(await page.locator('#rich-preview strong em').textContent(),'AB123CD');
 assert.equal(await page.locator('#rich-preview a').textContent(),'Vehicle PR code guide');
 assert.equal(await page.locator('#rich-preview a').getAttribute('href'),'https://example.com/guide?part=1&vehicle=2');
 assert.equal(await page.locator('#rich-preview ul li').count(),2);
 assert.equal(await page.locator('#rich-preview ol li').count(),2);
 const spaced=await page.locator('#rich-preview ul li').first().boundingBox();
 const compact=await page.locator('#rich-preview ol li').first().boundingBox();
 assert.ok(spaced.height>=compact.height+20,'Spaced lists have a visible blank line without extra bullets');
 await page.locator('#rich-preview').evaluate(e=>e.remove());
 console.log('Browser layout checks passed: menu sizing, footer access, and isolated drafts across separate and reused ticket sidebars.');
 console.log('Browser rich-text checks passed: bold, italic, paragraphs, bullets, numbering, and list spacing.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});


