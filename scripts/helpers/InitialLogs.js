// Startup logs to run on every script
function InitialLogs(name) {
  console.log(
    `
  $$$$$$$$$$$$$$$$NNMMMMN$$$$$$$$$$$$$$$$$
  $$$$$$$$$$$$$NMFVVVVVVVIN$$$$$$$$$$$$$$$
  $$$$$$$$$$$NIVVVVVVVVVVVVM$$$$$$$$$$$$$$
  $$$$$$$$$$NFVVVVVVVVVIMMFVIN$$$$$$$$$$$$
  $$$$$$$$$MVVVVVVVVVVVV$$$MVM$$$$$$$$$$$$
  $$$$$$$NIVVVVVVVVVVVVVM$$:..:M$$$$$$$$$$
  $$$$$V*VVIFVVVVVVVVVVVI$$V*::I$$$$$$$$$$
  $$$N*....::**VVVVFIIFFI$$$$$$$$$$$$$$$$$
  $$$V................::**N$$$$$$$$$$$$$$$
  $V*VV**.................I$$$$$$$$$$$$$$$
  $F*:::**VF**:..........*MN$$$$$$$$$$$$$$
  $$$VVV*::::*********MIMN$$$$$$$$$$$$$$$$
  $$$$$$N**:*V*:VV:::V$$$$$$$$$$$$$$$$$$$$
  $$$$$$N**:*V*:VV::.*$$$$$$$$$$$$$$$$$$$$
  $$$$$$N::**:**::::*V$$$$$$$$$$$$$$$$$$$$
  $$$$$$$IV:::::****MF**************VV$$$$
  $$$$$$$$$NNNNNNNNI**::::::::::::::**$$$$
  $$$$$$$$I**::::::::::::::::::**:::**$$$$
  $$$$$$$$I**::::::::::::::::*VMV:::**$$$$
  $$$$$$$$I**:*V*::*VVVVVVVVV$I:*V*:**$$$$
  $$$$$$$$I**:I$*::*$$$$$$$$$$I:V$*:**$$$$
  $$$$$$$$I*::F$*::*$$$$$$$$$$I:V$*:**$$$$
  $$$$$$$$NMMIN$MIIM$$$$$$$$$$NIM$MIMM$$$$
`
  );

  // pull version number from package.json
  console.log(`\n   🧀 ${name} v${require('../../package.json').version} 🧀\n    By: @CreativeBuilds\n`);
}
exports.InitialLogs = InitialLogs;
