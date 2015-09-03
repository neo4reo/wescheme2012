goog.provide('plt.compiler.convertToCircles');

goog.require("plt.compiler.literal");
goog.require("plt.compiler.symbolExpr");
goog.require("plt.compiler.Program");
goog.require("plt.compiler.callExpr");

// if not defined, declare the compiler object as part of plt
window.plt   = window.plt   || {};
plt.compiler = plt.compiler || {};

// BubbleEditor : CM (Text->AST) -> BubbleEditor
// Given a CM instance and a parser, attach a bubble editor to the CM instance
function BubbleEditor(cm, parser){
  var that = this;
  // set up variables needed by the BubbleEditor
  that.cm = cm;
  that.parser = parser;
  that.wrapper = cm.getWrapperElement();
  cm.circleIndices = {};
  that.buffer = document.getElementById('buffer') ||
                document.body.appendChild(document.createElement("textarea"));
  that.buffer.id = "buffer"; that.buffer.style.opacity = "0";
  that.buffer.style.position = "absolute";

  // clear circles
  cm.clearCircles = function(){
    cm.getAllMarks().filter(function(m){return m._circles;}).forEach(function(m){m.clear()});
  }

  // helper functions
  function isWhitespace(elt){return elt.classList.contains("cm-whitespace");}
  function isValue(elt){    return elt.classList.contains("value");}
  function isCircle(elt){   return elt.classList.contains("sexp");}
  function isSexp(elt){     return isValue(elt) || isCircle(elt); }
  function getNodeFromStoppedEvent(e){
    if(e){ e.stopPropagation(); return e.target || e.srcElement; }
  }
  
  function sanitizeWhitespace(node, txt){
    console.log(node);
    var start = cm.indexFromPos(node.from),
        end   = cm.indexFromPos(node.to),
        prev  = cm.getRange(cm.posFromIndex(start-1), node.from),
        next  = cm.getRange(node.to, cm.posFromIndex(end+1));
    return  (/\s|[\(\[\{]/.test(prev)? "":" ")+ txt.trim() +(/\s|[\)\]\}]/.test(next)? "":" ");
  }

  // select the highlighted node.
  function selectNode(e, node){
    node = getNodeFromStoppedEvent(e) || node;
    if(isWhitespace(node) || isSexp(node)){ node.focus(); }
    else { node.parentNode.focus(); }
  }
  // insert cursor at beginning of node.
  function startEdit(e, node){
    node = getNodeFromStoppedEvent(e) || node;
    node.contentEditable = "true";
    node.onblur = function(){saveEdit(node)};
    node.ondblclick = null; // allow dblclick to work normally
    node.onkeydown = function(e){
      e.stopPropagation();
      e.codemirrorIgnore = true;
      if (e.which===13 || e.which===9){        // RETURN / TAB: blur() to save
        node.blur();
      } else if(e.which===32){                 // SPACE: ignore?
      }
    };
    var range = document.createRange();
    range.setStart(node, 0);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  }
  // remove keyhandlers and update CM
  function saveEdit(node){
    node.onkeydown = null;
    node.contentEditable = "false";
    node.classList.remove('editing');
    cm.replaceRange(sanitizeWhitespace(node, node.innerText), node.from, node.to);
  }
  function handleCopyCut(e){
    var active = document.activeElement;
    if(isSexp(active)){
      e.stopPropagation();
      buffer.innerText = cm.getRange(active.from, active.to);
      buffer.select();
      try{ document.execCommand(e.type); }
      catch(e) { console.log('problem with execCommand("'+e.type+'")'); }
      setTimeout(function(){active.focus();}, 200);
    }
    if(e.type==="cut") cm.replaceRange('', active.from, active.to);
  };

  // Copy / Cut events must be captured and simulated
  document.oncut = document.oncopy = handleCopyCut;
  // Tab always selects the node after the cursor, or after the currently-selected node
  that.cm.on("keydown", function(cm, e){ if(e.which===9) e.codemirrorIgnore = true; });
  that.wrapper.onkeydown = handleKey;
  function handleKey(e){
    var active = document.activeElement, cursor = cm.getCursor();
    if(e.which===8 && isSexp(active)){    // DELETE
      e.preventDefault();
      cm.replaceRange('', active.from, active.to);
    }
    if (e.which===13 && isValue(active)){ // RETURN
      e.preventDefault();
      startEdit(false, active);
    }
    if(e.which===9){                      // TAB
      e.codemirrorIgnore = true; e.stopPropagation();
    }
    if(e.which===57){                     // OPEN PAREN
      e.preventDefault();
      cm.replaceRange('()', cursor, cursor);
      var idx = cm.indexFromPos(cursor);
    }
    if(e.which===48 && isSexp(active)){   // CLOSE PAREN
      e.preventDefault();
      while(!active.classList.contains("CodeMirror-widget"))
        active = active.parentNode;
      var endIndex = cm.indexFromPos(active.firstChild.to);
      cm.setCursor(cm.posFromIndex(endIndex+1)); cm.focus();
    }
    if(e.which===37){     // LEFT ARROW
      if(isSexp(active)){
        if(active.parentNode.classList.contains("CodeMirror-widget")){
          cm.setCursor(active.from); cm.focus();
        } else {
          console.log('span[tabIndex="'+(active.tabIndex-1)+'"]');
          var prev = that.wrapper.querySelectorAll('[tabIndex="'+(active.tabIndex-1)+'"]')[0];
          selectNode(false, prev);
        }
      } else {
        for(var i in cm.circleIndices){
          if (!cm.circleIndices.hasOwnProperty(i)) continue;
          var node = cm.circleIndices[i], edge = node.from;
          if(edge.line === cursor.line && edge.ch === cursor.ch){
            while(node.childNodes.length>2){
              node = node.lastChild.previousSibling.previousSibling;
            }
            selectNode(false, node); break;
          }
        }
      }
    }
    if(e.which===39){     // RIGHT ARROW
      if(isSexp(active)){
        if(active.parentNode.classList.contains("CodeMirror-widget")){
          cm.setCursor(active.to); cm.focus();
        } else {
          console.log('span[tabIndex="'+(active.tabIndex+1)+'"]');
          var prev = that.wrapper.querySelectorAll('[tabIndex="'+(active.tabIndex+1)+'"]')[0];
          selectNode(false, prev);
        }
      } else {
        for(var i in cm.circleIndices){
          if (!cm.circleIndices.hasOwnProperty(i)) continue;
          var node = cm.circleIndices[i], edge = node.to;
          if(edge.line === cursor.line && edge.ch === cursor.ch){
            selectNode(false, node); break;
          }
        }
      }
    }
  }
  function handleDragStart(e){// make draggable things translucent
    var node = getNodeFromStoppedEvent(e) || node;
    node.style.opacity = '0.2';
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setDragImage(node, -5, -5);
    e.dataTransfer.setData('text', cm.getRange(node.from, node.to));
  }
  function handleDragOver(e){ // apparently HTML5 requires this?!?!?
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    return false;
  }
  function colorTarget(e) {   // add dragover styles
    var node = getNodeFromStoppedEvent(e) || node;
    if(!document.activeElement.contains(node)){
      node.classList.add(isWhitespace(node)? 'insert' : 'replace');
    }
  }
  function unColorTarget(e) { // remove dragover styles
   (getNodeFromStoppedEvent(e) || node).classList.remove('insert', 'replace');
  }
  function cleanUp(e) {       // make sure nothing is left partially-opaque
    (getNodeFromStoppedEvent(e) || node).style.opacity = '1.0';
  }
  // if we've dropped one element into a different one, perform the CM modifications
  function dropWrapper(cm, e){ handleDrop(e); }
  function handleDrop(e) {
    e.codemirrorIgnore = true; e.preventDefault();
    var node = getNodeFromStoppedEvent(e) || node, active = document.activeElement;
    if(!node.location){
      var pos = cm.coordsChar({left: e.pageX, top: e.pageY});
      node.location = {startChar: pos.ch, endChar: pos.ch};
    }
    node.classList.remove('insert', 'replace');
    if (!active.contains(node)) {
      var text     = e.dataTransfer.getData('text');
      if(node.classList.contains('CodeMirror-line')
        || node.parentNode.classList.contains('CodeMirror-line')){ // for dropping into the parent
        var pos = cm.coordsChar({left: e.pageX, top: e.pageY});
        node.from = node.to = pos;
      }
      text = sanitizeWhitespace(node, text);
      // Modify the src or dest first, depending on which comes earlier in the document
      // Be sure to combine both operations into one, so undo works properly
      cm.operation(function(){
        if(cm.indexFromPos(active.to) < cm.indexFromPos(node.from)){
          cm.replaceRange(text, node.from, node.to);
          cm.replaceRange('', active.from, active.to);
        } else {
          cm.replaceRange('', active.from, active.to);
          cm.replaceRange(text, node.from, node.to);
        }
      });
    }
    return false;
  }

   function assignEvents(parent){
      Object.keys(cm.circleIndices).forEach(function(k,i){
        cm.circleIndices[k].tabIndex=2;
      });
              
      // Assign Event Handlers (avoid addEventListener, which allows duplicates)
      var whitespace  = parent.querySelectorAll('.cm-whitespace'),
          sexpElts    = parent.querySelectorAll('.value, .sexp>*:nth-child(2), .sexp'),
          dragTargets = parent.querySelectorAll('.value, .sexp>*:nth-child(2), .sexp, .cm-whitespace'),
          dropTargets = parent.querySelectorAll('.value, .sexp>*:nth-child(2), .cm-whitespace')
          editable    = parent.querySelectorAll('.value');
              
      // editable things can be edited on dblclick
      [ ].forEach.call(editable,  function (elt){elt.ondblclick = startEdit;});
      // whitespace becomes editable the moment you click
      [ ].forEach.call(whitespace,  function (elt){elt.onclick = startEdit;});
      // values and expressions can be clicked and dragged
      [ ].forEach.call(sexpElts,    function (elt){
         elt.onclick = selectNode; elt.ondragstart = handleDragStart; });
      // all elements can be dragged over
      [ ].forEach.call(dragTargets, function (elt){
         elt.ondragover = handleDragOver; elt.ondragend = cleanUp; });
      // anything but a circe can be dropped into/over
      [ ].forEach.call(dropTargets, function (elt){
         elt.ondragenter = colorTarget; elt.ondragleave = unColorTarget;
         elt.ondrop = handleDrop; });
      // allow dropping into the CM element
      that.cm.off("drop", dropWrapper);
      that.cm.on("drop", dropWrapper);
    }

  // remove all bubbles and regenerate them, based on CM instance
  that.refresh = function(){
    console.log('refreshing entire bubble editor with:\n'+that.cm.getValue());
    cm.clearCircles();
    cm.circleIndices = [];
    that.parser(that.cm.getValue()).forEach(function(p){
      var circle = p.toCircles(cm);
      that.cm.markText(circle.from, circle.to,
                       {replacedWith: circle
                       , handleMouseEvents: false
                       , _circles: true});
    });
    setTimeout(function(){assignEvents(that.wrapper);}, 300);
  }
                  
  function addChildAfterPos(parent, child){
      var startCh = parent.lastChild? parent.lastChild.location.endChar : parent.location.startChar,
          startLn = parent.lastChild? parent.lastChild.location.endRow : parent.location.startRow,
          endCh   = child.location.startChar,
          endLn   = child.location.startRow,
          br      = document.createElement('span'),
          str     = that.cm.getRange(cm.posFromIndex(startCh), cm.posFromIndex(endCh),"\n"),
          lines   = str.split("\n"),
          spansMultipleLines = lines.length>1;
      br.style.height = "0"; br.className = "lineBreak";
      parent.appendChild(makeWhitespace(startCh, lines[0]));
      for(var i=1; i<lines.length; i++){
        var lineBreak = br.cloneNode(true);
        lineBreak.from = lineBreak.to = child.from;
        parent.appendChild(lineBreak);
        parent.appendChild(makeWhitespace(startCh, lines[i]));
        startCh+=lines[i].length+1;
      }
      parent.appendChild(child);
      return spansMultipleLines;
   }
                                        
    function makeWhitespace(startCh, txt){
      var space   = document.createElement('span');
      space.className="cm-whitespace";
      space.location = {startChar: startCh, endChar: startCh+txt.length};
      space.from = that.cm.posFromIndex(startCh);
      space.to = cm.posFromIndex(startCh+txt.length);
      space.appendChild(document.createTextNode(txt));
      return space;
    }
                  
    that.makeValue = function(valueTxt, className, location){
      var node = document.createElement('span');
      node.className = "value "+className;
      node.appendChild(document.createTextNode(valueTxt));
      node.location = location;
      node.from = that.cm.posFromIndex(location.startChar);
      node.to   = that.cm.posFromIndex(location.endChar);
      node.draggable="true";
      node.setAttribute('aria-label', valueTxt);
      node.setAttribute('role', "treeitem");
      cm.circleIndices[location.startChar] = node;
      return node;
    }
                                        
    that.makeExpression = function(func, args, location){
      var expression = document.createElement('div'),
          ariaStr = (func? func.val : "empty") +
                    " expression, " + args.length+" argument" +
                    (args.length===1 ? "" : "s"),
          lParen = document.createElement('span'),
          rParen = document.createElement('span'),
          operator = document.createElement('span'),
          startPos = cm.posFromIndex(location.startChar+1),
          endPos = cm.posFromIndex(location.endChar);
      expression.classList.add("sexp");
      expression.location = location;
      expression.from = cm.posFromIndex(location.startChar);
      expression.to   = cm.posFromIndex(location.endChar);
      lParen.className = "lParen";        rParen.className = "rParen";
      lParen.location = location.start(); rParen.location = location.end();
      lParen.from = that.cm.posFromIndex(location.startChar);
      lParen.to   = that.cm.posFromIndex(location.startChar+1);
      lParen.appendChild(document.createTextNode(that.cm.getTokenAt(startPos).string));
      rParen.appendChild(document.createTextNode(that.cm.getTokenAt(endPos).string));
      rParen.from = that.cm.posFromIndex(location.endChar);
      rParen.to   = that.cm.posFromIndex(location.endChar+1);
      expression.appendChild(lParen);
      operator.location = func? func.location :
                  {startChar: location.startChar+1, endChar: location.endChar-1};
      operator.from = cm.posFromIndex(operator.location.startChar);
      operator.to = cm.posFromIndex(operator.location.endChar);
      var funcValue = func? func.toCircles(cm) :
                      that.makeValue(" ", "cm-whitespace", operator.location, cm);
      funcValue.location = operator.location;
      operator.appendChild(funcValue);
      expression.appendChild(operator);
      args.forEach(function(arg){ addChildAfterPos(expression, arg.toCircles()); });
      if(func){ addChildAfterPos(expression, rParen); } 
      else {
        var filler = document.createElement("span");
        filler.style.cssText = "min-height: 10px; display: inline-block; vertical-align: middle;";
        expression.appendChild(filler);
        expression.appendChild(rParen);
      }
      expression.draggable="true";
      expression.setAttribute('aria-label', ariaStr);
      expression.setAttribute('role', "treeitem");
      cm.circleIndices[location.startChar] = expression;
      return expression;
    }
                  
   // Program.prototype.toCircles: CM -> DOM
   plt.compiler.Program.prototype.toCircles = function(){
      throw this.constructor.name+" cannot be made into a Circle of Evaluation";
   };
   // make an expression, convert the operator to a circle, assign it the "operator" class,
   // and convert all the arguments to circles as well
   plt.compiler.callExpr.prototype.toCircles = function(){
      return that.makeExpression(this.func, this.args, this.location);
   };
   plt.compiler.symbolExpr.prototype.toCircles = function(){
      return that.makeValue(this.val, "wescheme-symbol", this.location);
   };
   plt.compiler.literal.prototype.toCircles = function(){
      // if it's not parseable as a native num, nor is it a number structure, it's a string
      var className = (isNaN(this.val.toString()) && !this.val.isFinite)?
            "wescheme-string" : "wescheme-number";
      return that.makeValue(this.stx||this.toString(), className, this.location);
   };
   
    that.refresh();
    return that;
}