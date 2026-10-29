// Model an output pipe whose consumer is paused. No OS pipe-buffer sizes are assumed.
process.stdout.write=function(){process.send?.({event:'output'});return false;};
