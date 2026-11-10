var LezerJS = (function (exports) {
    'use strict';

    /**
    The default maximum length of a `TreeBuffer` node.
    */
    const DefaultBufferLength = 1024;
    let nextPropID = 0;
    class Range {
        constructor(from, to) {
            this.from = from;
            this.to = to;
        }
    }
    /**
    Each [node type](#common.NodeType) or [individual tree](#common.Tree)
    can have metadata associated with it in props. Instances of this
    class represent prop names.
    */
    class NodeProp {
        /**
        Create a new node prop type.
        */
        constructor(config = {}) {
            this.id = nextPropID++;
            this.perNode = !!config.perNode;
            this.deserialize = config.deserialize || (() => {
                throw new Error("This node type doesn't define a deserialize function");
            });
        }
        /**
        This is meant to be used with
        [`NodeSet.extend`](#common.NodeSet.extend) or
        [`LRParser.configure`](#lr.ParserConfig.props) to compute
        prop values for each node type in the set. Takes a [match
        object](#common.NodeType^match) or function that returns undefined
        if the node type doesn't get this prop, and the prop's value if
        it does.
        */
        add(match) {
            if (this.perNode)
                throw new RangeError("Can't add per-node props to node types");
            if (typeof match != "function")
                match = NodeType.match(match);
            return (type) => {
                let result = match(type);
                return result === undefined ? null : [this, result];
            };
        }
    }
    /**
    Prop that is used to describe matching delimiters. For opening
    delimiters, this holds an array of node names (written as a
    space-separated string when declaring this prop in a grammar)
    for the node types of closing delimiters that match it.
    */
    NodeProp.closedBy = new NodeProp({ deserialize: str => str.split(" ") });
    /**
    The inverse of [`closedBy`](#common.NodeProp^closedBy). This is
    attached to closing delimiters, holding an array of node names
    of types of matching opening delimiters.
    */
    NodeProp.openedBy = new NodeProp({ deserialize: str => str.split(" ") });
    /**
    Used to assign node types to groups (for example, all node
    types that represent an expression could be tagged with an
    `"Expression"` group).
    */
    NodeProp.group = new NodeProp({ deserialize: str => str.split(" ") });
    /**
    Attached to nodes to indicate these should be
    [displayed](https://codemirror.net/docs/ref/#language.syntaxTree)
    in a bidirectional text isolate, so that direction-neutral
    characters on their sides don't incorrectly get associated with
    surrounding text. You'll generally want to set this for nodes
    that contain arbitrary text, like strings and comments, and for
    nodes that appear _inside_ arbitrary text, like HTML tags. When
    not given a value, in a grammar declaration, defaults to
    `"auto"`.
    */
    NodeProp.isolate = new NodeProp({ deserialize: value => {
            if (value && value != "rtl" && value != "ltr" && value != "auto")
                throw new RangeError("Invalid value for isolate: " + value);
            return value || "auto";
        } });
    /**
    The hash of the [context](#lr.ContextTracker.constructor)
    that the node was parsed in, if any. Used to limit reuse of
    contextual nodes.
    */
    NodeProp.contextHash = new NodeProp({ perNode: true });
    /**
    The distance beyond the end of the node that the tokenizer
    looked ahead for any of the tokens inside the node. (The LR
    parser only stores this when it is larger than 25, for
    efficiency reasons.)
    */
    NodeProp.lookAhead = new NodeProp({ perNode: true });
    /**
    This per-node prop is used to replace a given node, or part of a
    node, with another tree. This is useful to include trees from
    different languages in mixed-language parsers.
    */
    NodeProp.mounted = new NodeProp({ perNode: true });
    /**
    A mounted tree, which can be [stored](#common.NodeProp^mounted) on
    a tree node to indicate that parts of its content are
    represented by another tree.
    */
    class MountedTree {
        constructor(
        /**
        The inner tree.
        */
        tree,
        /**
        If this is null, this tree replaces the entire node (it will
        be included in the regular iteration instead of its host
        node). If not, only the given ranges are considered to be
        covered by this tree. This is used for trees that are mixed in
        a way that isn't strictly hierarchical. Such mounted trees are
        only entered by [`resolveInner`](#common.Tree.resolveInner)
        and [`enter`](#common.SyntaxNode.enter).
        */
        overlay,
        /**
        The parser used to create this subtree.
        */
        parser) {
            this.tree = tree;
            this.overlay = overlay;
            this.parser = parser;
        }
        /**
        @internal
        */
        static get(tree) {
            return tree && tree.props && tree.props[NodeProp.mounted.id];
        }
    }
    const noProps = Object.create(null);
    /**
    Each node in a syntax tree has a node type associated with it.
    */
    class NodeType {
        /**
        @internal
        */
        constructor(
        /**
        The name of the node type. Not necessarily unique, but if the
        grammar was written properly, different node types with the
        same name within a node set should play the same semantic
        role.
        */
        name,
        /**
        @internal
        */
        props,
        /**
        The id of this node in its set. Corresponds to the term ids
        used in the parser.
        */
        id,
        /**
        @internal
        */
        flags = 0) {
            this.name = name;
            this.props = props;
            this.id = id;
            this.flags = flags;
        }
        /**
        Define a node type.
        */
        static define(spec) {
            let props = spec.props && spec.props.length ? Object.create(null) : noProps;
            let flags = (spec.top ? 1 /* NodeFlag.Top */ : 0) | (spec.skipped ? 2 /* NodeFlag.Skipped */ : 0) |
                (spec.error ? 4 /* NodeFlag.Error */ : 0) | (spec.name == null ? 8 /* NodeFlag.Anonymous */ : 0);
            let type = new NodeType(spec.name || "", props, spec.id, flags);
            if (spec.props)
                for (let src of spec.props) {
                    if (!Array.isArray(src))
                        src = src(type);
                    if (src) {
                        if (src[0].perNode)
                            throw new RangeError("Can't store a per-node prop on a node type");
                        props[src[0].id] = src[1];
                    }
                }
            return type;
        }
        /**
        Retrieves a node prop for this type. Will return `undefined` if
        the prop isn't present on this node.
        */
        prop(prop) { return this.props[prop.id]; }
        /**
        True when this is the top node of a grammar.
        */
        get isTop() { return (this.flags & 1 /* NodeFlag.Top */) > 0; }
        /**
        True when this node is produced by a skip rule.
        */
        get isSkipped() { return (this.flags & 2 /* NodeFlag.Skipped */) > 0; }
        /**
        Indicates whether this is an error node.
        */
        get isError() { return (this.flags & 4 /* NodeFlag.Error */) > 0; }
        /**
        When true, this node type doesn't correspond to a user-declared
        named node, for example because it is used to cache repetition.
        */
        get isAnonymous() { return (this.flags & 8 /* NodeFlag.Anonymous */) > 0; }
        /**
        Returns true when this node's name or one of its
        [groups](#common.NodeProp^group) matches the given string.
        */
        is(name) {
            if (typeof name == 'string') {
                if (this.name == name)
                    return true;
                let group = this.prop(NodeProp.group);
                return group ? group.indexOf(name) > -1 : false;
            }
            return this.id == name;
        }
        /**
        Create a function from node types to arbitrary values by
        specifying an object whose property names are node or
        [group](#common.NodeProp^group) names. Often useful with
        [`NodeProp.add`](#common.NodeProp.add). You can put multiple
        names, separated by spaces, in a single property name to map
        multiple node names to a single value.
        */
        static match(map) {
            let direct = Object.create(null);
            for (let prop in map)
                for (let name of prop.split(" "))
                    direct[name] = map[prop];
            return (node) => {
                for (let groups = node.prop(NodeProp.group), i = -1; i < (groups ? groups.length : 0); i++) {
                    let found = direct[i < 0 ? node.name : groups[i]];
                    if (found)
                        return found;
                }
            };
        }
    }
    /**
    An empty dummy node type to use when no actual type is available.
    */
    NodeType.none = new NodeType("", Object.create(null), 0, 8 /* NodeFlag.Anonymous */);
    /**
    A node set holds a collection of node types. It is used to
    compactly represent trees by storing their type ids, rather than a
    full pointer to the type object, in a numeric array. Each parser
    [has](#lr.LRParser.nodeSet) a node set, and [tree
    buffers](#common.TreeBuffer) can only store collections of nodes
    from the same set. A set can have a maximum of 2**16 (65536) node
    types in it, so that the ids fit into 16-bit typed array slots.
    */
    class NodeSet {
        /**
        Create a set with the given types. The `id` property of each
        type should correspond to its position within the array.
        */
        constructor(
        /**
        The node types in this set, by id.
        */
        types) {
            this.types = types;
            for (let i = 0; i < types.length; i++)
                if (types[i].id != i)
                    throw new RangeError("Node type ids should correspond to array positions when creating a node set");
        }
        /**
        Create a copy of this set with some node properties added. The
        arguments to this method can be created with
        [`NodeProp.add`](#common.NodeProp.add).
        */
        extend(...props) {
            let newTypes = [];
            for (let type of this.types) {
                let newProps = null;
                for (let source of props) {
                    let add = source(type);
                    if (add) {
                        if (!newProps)
                            newProps = Object.assign({}, type.props);
                        newProps[add[0].id] = add[1];
                    }
                }
                newTypes.push(newProps ? new NodeType(type.name, newProps, type.id, type.flags) : type);
            }
            return new NodeSet(newTypes);
        }
    }
    const CachedNode = new WeakMap(), CachedInnerNode = new WeakMap();
    /**
    Options that control iteration. Can be combined with the `|`
    operator to enable multiple ones.
    */
    var IterMode;
    (function (IterMode) {
        /**
        When enabled, iteration will only visit [`Tree`](#common.Tree)
        objects, not nodes packed into
        [`TreeBuffer`](#common.TreeBuffer)s.
        */
        IterMode[IterMode["ExcludeBuffers"] = 1] = "ExcludeBuffers";
        /**
        Enable this to make iteration include anonymous nodes (such as
        the nodes that wrap repeated grammar constructs into a balanced
        tree).
        */
        IterMode[IterMode["IncludeAnonymous"] = 2] = "IncludeAnonymous";
        /**
        By default, regular [mounted](#common.NodeProp^mounted) nodes
        replace their base node in iteration. Enable this to ignore them
        instead.
        */
        IterMode[IterMode["IgnoreMounts"] = 4] = "IgnoreMounts";
        /**
        This option only applies in
        [`enter`](#common.SyntaxNode.enter)-style methods. It tells the
        library to not enter mounted overlays if one covers the given
        position.
        */
        IterMode[IterMode["IgnoreOverlays"] = 8] = "IgnoreOverlays";
    })(IterMode || (IterMode = {}));
    /**
    A piece of syntax tree. There are two ways to approach these
    trees: the way they are actually stored in memory, and the
    convenient way.

    Syntax trees are stored as a tree of `Tree` and `TreeBuffer`
    objects. By packing detail information into `TreeBuffer` leaf
    nodes, the representation is made a lot more memory-efficient.

    However, when you want to actually work with tree nodes, this
    representation is very awkward, so most client code will want to
    use the [`TreeCursor`](#common.TreeCursor) or
    [`SyntaxNode`](#common.SyntaxNode) interface instead, which provides
    a view on some part of this data structure, and can be used to
    move around to adjacent nodes.
    */
    class Tree {
        /**
        Construct a new tree. See also [`Tree.build`](#common.Tree^build).
        */
        constructor(
        /**
        The type of the top node.
        */
        type,
        /**
        This node's child nodes.
        */
        children,
        /**
        The positions (offsets relative to the start of this tree) of
        the children.
        */
        positions,
        /**
        The total length of this tree
        */
        length,
        /**
        Per-node [node props](#common.NodeProp) to associate with this node.
        */
        props) {
            this.type = type;
            this.children = children;
            this.positions = positions;
            this.length = length;
            /**
            @internal
            */
            this.props = null;
            if (props && props.length) {
                this.props = Object.create(null);
                for (let [prop, value] of props)
                    this.props[typeof prop == "number" ? prop : prop.id] = value;
            }
        }
        /**
        @internal
        */
        toString() {
            let mounted = MountedTree.get(this);
            if (mounted && !mounted.overlay)
                return mounted.tree.toString();
            let children = "";
            for (let ch of this.children) {
                let str = ch.toString();
                if (str) {
                    if (children)
                        children += ",";
                    children += str;
                }
            }
            return !this.type.name ? children :
                (/\W/.test(this.type.name) && !this.type.isError ? JSON.stringify(this.type.name) : this.type.name) +
                    (children.length ? "(" + children + ")" : "");
        }
        /**
        Get a [tree cursor](#common.TreeCursor) positioned at the top of
        the tree. Mode can be used to [control](#common.IterMode) which
        nodes the cursor visits.
        */
        cursor(mode = 0) {
            return new TreeCursor(this.topNode, mode);
        }
        /**
        Get a [tree cursor](#common.TreeCursor) pointing into this tree
        at the given position and side (see
        [`moveTo`](#common.TreeCursor.moveTo).
        */
        cursorAt(pos, side = 0, mode = 0) {
            let scope = CachedNode.get(this) || this.topNode;
            let cursor = new TreeCursor(scope);
            cursor.moveTo(pos, side);
            CachedNode.set(this, cursor._tree);
            return cursor;
        }
        /**
        Get a [syntax node](#common.SyntaxNode) object for the top of the
        tree.
        */
        get topNode() {
            return new TreeNode(this, 0, 0, null);
        }
        /**
        Get the [syntax node](#common.SyntaxNode) at the given position.
        If `side` is -1, this will move into nodes that end at the
        position. If 1, it'll move into nodes that start at the
        position. With 0, it'll only enter nodes that cover the position
        from both sides.

        Note that this will not enter
        [overlays](#common.MountedTree.overlay), and you often want
        [`resolveInner`](#common.Tree.resolveInner) instead.
        */
        resolve(pos, side = 0) {
            let node = resolveNode(CachedNode.get(this) || this.topNode, pos, side, false);
            CachedNode.set(this, node);
            return node;
        }
        /**
        Like [`resolve`](#common.Tree.resolve), but will enter
        [overlaid](#common.MountedTree.overlay) nodes, producing a syntax node
        pointing into the innermost overlaid tree at the given position
        (with parent links going through all parent structure, including
        the host trees).
        */
        resolveInner(pos, side = 0) {
            let node = resolveNode(CachedInnerNode.get(this) || this.topNode, pos, side, true);
            CachedInnerNode.set(this, node);
            return node;
        }
        /**
        In some situations, it can be useful to iterate through all
        nodes around a position, including those in overlays that don't
        directly cover the position. This method gives you an iterator
        that will produce all nodes, from small to big, around the given
        position.
        */
        resolveStack(pos, side = 0) {
            return stackIterator(this, pos, side);
        }
        /**
        Iterate over the tree and its children, calling `enter` for any
        node that touches the `from`/`to` region (if given) before
        running over such a node's children, and `leave` (if given) when
        leaving the node. When `enter` returns `false`, that node will
        not have its children iterated over (or `leave` called).
        */
        iterate(spec) {
            let { enter, leave, from = 0, to = this.length } = spec;
            let mode = spec.mode || 0, anon = (mode & IterMode.IncludeAnonymous) > 0;
            for (let c = this.cursor(mode | IterMode.IncludeAnonymous);;) {
                let entered = false;
                if (c.from <= to && c.to >= from && (!anon && c.type.isAnonymous || enter(c) !== false)) {
                    if (c.firstChild())
                        continue;
                    entered = true;
                }
                for (;;) {
                    if (entered && leave && (anon || !c.type.isAnonymous))
                        leave(c);
                    if (c.nextSibling())
                        break;
                    if (!c.parent())
                        return;
                    entered = true;
                }
            }
        }
        /**
        Get the value of the given [node prop](#common.NodeProp) for this
        node. Works with both per-node and per-type props.
        */
        prop(prop) {
            return !prop.perNode ? this.type.prop(prop) : this.props ? this.props[prop.id] : undefined;
        }
        /**
        Returns the node's [per-node props](#common.NodeProp.perNode) in a
        format that can be passed to the [`Tree`](#common.Tree)
        constructor.
        */
        get propValues() {
            let result = [];
            if (this.props)
                for (let id in this.props)
                    result.push([+id, this.props[id]]);
            return result;
        }
        /**
        Balance the direct children of this tree, producing a copy of
        which may have children grouped into subtrees with type
        [`NodeType.none`](#common.NodeType^none).
        */
        balance(config = {}) {
            return this.children.length <= 8 /* Balance.BranchFactor */ ? this :
                balanceRange(NodeType.none, this.children, this.positions, 0, this.children.length, 0, this.length, (children, positions, length) => new Tree(this.type, children, positions, length, this.propValues), config.makeTree || ((children, positions, length) => new Tree(NodeType.none, children, positions, length)));
        }
        /**
        Build a tree from a postfix-ordered buffer of node information,
        or a cursor over such a buffer.
        */
        static build(data) { return buildTree(data); }
    }
    /**
    The empty tree
    */
    Tree.empty = new Tree(NodeType.none, [], [], 0);
    class FlatBufferCursor {
        constructor(buffer, index) {
            this.buffer = buffer;
            this.index = index;
        }
        get id() { return this.buffer[this.index - 4]; }
        get start() { return this.buffer[this.index - 3]; }
        get end() { return this.buffer[this.index - 2]; }
        get size() { return this.buffer[this.index - 1]; }
        get pos() { return this.index; }
        next() { this.index -= 4; }
        fork() { return new FlatBufferCursor(this.buffer, this.index); }
    }
    /**
    Tree buffers contain (type, start, end, endIndex) quads for each
    node. In such a buffer, nodes are stored in prefix order (parents
    before children, with the endIndex of the parent indicating which
    children belong to it).
    */
    class TreeBuffer {
        /**
        Create a tree buffer.
        */
        constructor(
        /**
        The buffer's content.
        */
        buffer,
        /**
        The total length of the group of nodes in the buffer.
        */
        length,
        /**
        The node set used in this buffer.
        */
        set) {
            this.buffer = buffer;
            this.length = length;
            this.set = set;
        }
        /**
        @internal
        */
        get type() { return NodeType.none; }
        /**
        @internal
        */
        toString() {
            let result = [];
            for (let index = 0; index < this.buffer.length;) {
                result.push(this.childString(index));
                index = this.buffer[index + 3];
            }
            return result.join(",");
        }
        /**
        @internal
        */
        childString(index) {
            let id = this.buffer[index], endIndex = this.buffer[index + 3];
            let type = this.set.types[id], result = type.name;
            if (/\W/.test(result) && !type.isError)
                result = JSON.stringify(result);
            index += 4;
            if (endIndex == index)
                return result;
            let children = [];
            while (index < endIndex) {
                children.push(this.childString(index));
                index = this.buffer[index + 3];
            }
            return result + "(" + children.join(",") + ")";
        }
        /**
        @internal
        */
        findChild(startIndex, endIndex, dir, pos, side) {
            let { buffer } = this, pick = -1;
            for (let i = startIndex; i != endIndex; i = buffer[i + 3]) {
                if (checkSide(side, pos, buffer[i + 1], buffer[i + 2])) {
                    pick = i;
                    if (dir > 0)
                        break;
                }
            }
            return pick;
        }
        /**
        @internal
        */
        slice(startI, endI, from) {
            let b = this.buffer;
            let copy = new Uint16Array(endI - startI), len = 0;
            for (let i = startI, j = 0; i < endI;) {
                copy[j++] = b[i++];
                copy[j++] = b[i++] - from;
                let to = copy[j++] = b[i++] - from;
                copy[j++] = b[i++] - startI;
                len = Math.max(len, to);
            }
            return new TreeBuffer(copy, len, this.set);
        }
    }
    function checkSide(side, pos, from, to) {
        switch (side) {
            case -2 /* Side.Before */: return from < pos;
            case -1 /* Side.AtOrBefore */: return to >= pos && from < pos;
            case 0 /* Side.Around */: return from < pos && to > pos;
            case 1 /* Side.AtOrAfter */: return from <= pos && to > pos;
            case 2 /* Side.After */: return to > pos;
            case 4 /* Side.DontCare */: return true;
        }
    }
    function resolveNode(node, pos, side, overlays) {
        var _a;
        // Move up to a node that actually holds the position, if possible
        while (node.from == node.to ||
            (side < 1 ? node.from >= pos : node.from > pos) ||
            (side > -1 ? node.to <= pos : node.to < pos)) {
            let parent = !overlays && node instanceof TreeNode && node.index < 0 ? null : node.parent;
            if (!parent)
                return node;
            node = parent;
        }
        let mode = overlays ? 0 : IterMode.IgnoreOverlays;
        // Must go up out of overlays when those do not overlap with pos
        if (overlays)
            for (let scan = node, parent = scan.parent; parent; scan = parent, parent = scan.parent) {
                if (scan instanceof TreeNode && scan.index < 0 && ((_a = parent.enter(pos, side, mode)) === null || _a === void 0 ? void 0 : _a.from) != scan.from)
                    node = parent;
            }
        for (;;) {
            let inner = node.enter(pos, side, mode);
            if (!inner)
                return node;
            node = inner;
        }
    }
    class BaseNode {
        cursor(mode = 0) { return new TreeCursor(this, mode); }
        getChild(type, before = null, after = null) {
            let r = getChildren(this, type, before, after);
            return r.length ? r[0] : null;
        }
        getChildren(type, before = null, after = null) {
            return getChildren(this, type, before, after);
        }
        resolve(pos, side = 0) {
            return resolveNode(this, pos, side, false);
        }
        resolveInner(pos, side = 0) {
            return resolveNode(this, pos, side, true);
        }
        matchContext(context) {
            return matchNodeContext(this.parent, context);
        }
        enterUnfinishedNodesBefore(pos) {
            let scan = this.childBefore(pos), node = this;
            while (scan) {
                let last = scan.lastChild;
                if (!last || last.to != scan.to)
                    break;
                if (last.type.isError && last.from == last.to) {
                    node = scan;
                    scan = last.prevSibling;
                }
                else {
                    scan = last;
                }
            }
            return node;
        }
        get node() { return this; }
        get next() { return this.parent; }
    }
    class TreeNode extends BaseNode {
        constructor(_tree, from,
        // Index in parent node, set to -1 if the node is not a direct child of _parent.node (overlay)
        index, _parent) {
            super();
            this._tree = _tree;
            this.from = from;
            this.index = index;
            this._parent = _parent;
        }
        get type() { return this._tree.type; }
        get name() { return this._tree.type.name; }
        get to() { return this.from + this._tree.length; }
        nextChild(i, dir, pos, side, mode = 0) {
            for (let parent = this;;) {
                for (let { children, positions } = parent._tree, e = dir > 0 ? children.length : -1; i != e; i += dir) {
                    let next = children[i], start = positions[i] + parent.from;
                    if (!checkSide(side, pos, start, start + next.length))
                        continue;
                    if (next instanceof TreeBuffer) {
                        if (mode & IterMode.ExcludeBuffers)
                            continue;
                        let index = next.findChild(0, next.buffer.length, dir, pos - start, side);
                        if (index > -1)
                            return new BufferNode(new BufferContext(parent, next, i, start), null, index);
                    }
                    else if ((mode & IterMode.IncludeAnonymous) || (!next.type.isAnonymous || hasChild(next))) {
                        let mounted;
                        if (!(mode & IterMode.IgnoreMounts) && (mounted = MountedTree.get(next)) && !mounted.overlay)
                            return new TreeNode(mounted.tree, start, i, parent);
                        let inner = new TreeNode(next, start, i, parent);
                        return (mode & IterMode.IncludeAnonymous) || !inner.type.isAnonymous ? inner
                            : inner.nextChild(dir < 0 ? next.children.length - 1 : 0, dir, pos, side);
                    }
                }
                if ((mode & IterMode.IncludeAnonymous) || !parent.type.isAnonymous)
                    return null;
                if (parent.index >= 0)
                    i = parent.index + dir;
                else
                    i = dir < 0 ? -1 : parent._parent._tree.children.length;
                parent = parent._parent;
                if (!parent)
                    return null;
            }
        }
        get firstChild() { return this.nextChild(0, 1, 0, 4 /* Side.DontCare */); }
        get lastChild() { return this.nextChild(this._tree.children.length - 1, -1, 0, 4 /* Side.DontCare */); }
        childAfter(pos) { return this.nextChild(0, 1, pos, 2 /* Side.After */); }
        childBefore(pos) { return this.nextChild(this._tree.children.length - 1, -1, pos, -2 /* Side.Before */); }
        enter(pos, side, mode = 0) {
            let mounted;
            if (!(mode & IterMode.IgnoreOverlays) && (mounted = MountedTree.get(this._tree)) && mounted.overlay) {
                let rPos = pos - this.from;
                for (let { from, to } of mounted.overlay) {
                    if ((side > 0 ? from <= rPos : from < rPos) &&
                        (side < 0 ? to >= rPos : to > rPos))
                        return new TreeNode(mounted.tree, mounted.overlay[0].from + this.from, -1, this);
                }
            }
            return this.nextChild(0, 1, pos, side, mode);
        }
        nextSignificantParent() {
            let val = this;
            while (val.type.isAnonymous && val._parent)
                val = val._parent;
            return val;
        }
        get parent() {
            return this._parent ? this._parent.nextSignificantParent() : null;
        }
        get nextSibling() {
            return this._parent && this.index >= 0 ? this._parent.nextChild(this.index + 1, 1, 0, 4 /* Side.DontCare */) : null;
        }
        get prevSibling() {
            return this._parent && this.index >= 0 ? this._parent.nextChild(this.index - 1, -1, 0, 4 /* Side.DontCare */) : null;
        }
        get tree() { return this._tree; }
        toTree() { return this._tree; }
        /**
        @internal
        */
        toString() { return this._tree.toString(); }
    }
    function getChildren(node, type, before, after) {
        let cur = node.cursor(), result = [];
        if (!cur.firstChild())
            return result;
        if (before != null)
            for (let found = false; !found;) {
                found = cur.type.is(before);
                if (!cur.nextSibling())
                    return result;
            }
        for (;;) {
            if (after != null && cur.type.is(after))
                return result;
            if (cur.type.is(type))
                result.push(cur.node);
            if (!cur.nextSibling())
                return after == null ? result : [];
        }
    }
    function matchNodeContext(node, context, i = context.length - 1) {
        for (let p = node; i >= 0; p = p.parent) {
            if (!p)
                return false;
            if (!p.type.isAnonymous) {
                if (context[i] && context[i] != p.name)
                    return false;
                i--;
            }
        }
        return true;
    }
    class BufferContext {
        constructor(parent, buffer, index, start) {
            this.parent = parent;
            this.buffer = buffer;
            this.index = index;
            this.start = start;
        }
    }
    class BufferNode extends BaseNode {
        get name() { return this.type.name; }
        get from() { return this.context.start + this.context.buffer.buffer[this.index + 1]; }
        get to() { return this.context.start + this.context.buffer.buffer[this.index + 2]; }
        constructor(context, _parent, index) {
            super();
            this.context = context;
            this._parent = _parent;
            this.index = index;
            this.type = context.buffer.set.types[context.buffer.buffer[index]];
        }
        child(dir, pos, side) {
            let { buffer } = this.context;
            let index = buffer.findChild(this.index + 4, buffer.buffer[this.index + 3], dir, pos - this.context.start, side);
            return index < 0 ? null : new BufferNode(this.context, this, index);
        }
        get firstChild() { return this.child(1, 0, 4 /* Side.DontCare */); }
        get lastChild() { return this.child(-1, 0, 4 /* Side.DontCare */); }
        childAfter(pos) { return this.child(1, pos, 2 /* Side.After */); }
        childBefore(pos) { return this.child(-1, pos, -2 /* Side.Before */); }
        enter(pos, side, mode = 0) {
            if (mode & IterMode.ExcludeBuffers)
                return null;
            let { buffer } = this.context;
            let index = buffer.findChild(this.index + 4, buffer.buffer[this.index + 3], side > 0 ? 1 : -1, pos - this.context.start, side);
            return index < 0 ? null : new BufferNode(this.context, this, index);
        }
        get parent() {
            return this._parent || this.context.parent.nextSignificantParent();
        }
        externalSibling(dir) {
            return this._parent ? null : this.context.parent.nextChild(this.context.index + dir, dir, 0, 4 /* Side.DontCare */);
        }
        get nextSibling() {
            let { buffer } = this.context;
            let after = buffer.buffer[this.index + 3];
            if (after < (this._parent ? buffer.buffer[this._parent.index + 3] : buffer.buffer.length))
                return new BufferNode(this.context, this._parent, after);
            return this.externalSibling(1);
        }
        get prevSibling() {
            let { buffer } = this.context;
            let parentStart = this._parent ? this._parent.index + 4 : 0;
            if (this.index == parentStart)
                return this.externalSibling(-1);
            return new BufferNode(this.context, this._parent, buffer.findChild(parentStart, this.index, -1, 0, 4 /* Side.DontCare */));
        }
        get tree() { return null; }
        toTree() {
            let children = [], positions = [];
            let { buffer } = this.context;
            let startI = this.index + 4, endI = buffer.buffer[this.index + 3];
            if (endI > startI) {
                let from = buffer.buffer[this.index + 1];
                children.push(buffer.slice(startI, endI, from));
                positions.push(0);
            }
            return new Tree(this.type, children, positions, this.to - this.from);
        }
        /**
        @internal
        */
        toString() { return this.context.buffer.childString(this.index); }
    }
    function iterStack(heads) {
        if (!heads.length)
            return null;
        let pick = 0, picked = heads[0];
        for (let i = 1; i < heads.length; i++) {
            let node = heads[i];
            if (node.from > picked.from || node.to < picked.to) {
                picked = node;
                pick = i;
            }
        }
        let next = picked instanceof TreeNode && picked.index < 0 ? null : picked.parent;
        let newHeads = heads.slice();
        if (next)
            newHeads[pick] = next;
        else
            newHeads.splice(pick, 1);
        return new StackIterator(newHeads, picked);
    }
    class StackIterator {
        constructor(heads, node) {
            this.heads = heads;
            this.node = node;
        }
        get next() { return iterStack(this.heads); }
    }
    function stackIterator(tree, pos, side) {
        let inner = tree.resolveInner(pos, side), layers = null;
        for (let scan = inner instanceof TreeNode ? inner : inner.context.parent; scan; scan = scan.parent) {
            if (scan.index < 0) { // This is an overlay root
                let parent = scan.parent;
                (layers || (layers = [inner])).push(parent.resolve(pos, side));
                scan = parent;
            }
            else {
                let mount = MountedTree.get(scan.tree);
                // Relevant overlay branching off
                if (mount && mount.overlay && mount.overlay[0].from <= pos && mount.overlay[mount.overlay.length - 1].to >= pos) {
                    let root = new TreeNode(mount.tree, mount.overlay[0].from + scan.from, -1, scan);
                    (layers || (layers = [inner])).push(resolveNode(root, pos, side, false));
                }
            }
        }
        return layers ? iterStack(layers) : inner;
    }
    /**
    A tree cursor object focuses on a given node in a syntax tree, and
    allows you to move to adjacent nodes.
    */
    class TreeCursor {
        /**
        Shorthand for `.type.name`.
        */
        get name() { return this.type.name; }
        /**
        @internal
        */
        constructor(node,
        /**
        @internal
        */
        mode = 0) {
            this.mode = mode;
            /**
            @internal
            */
            this.buffer = null;
            this.stack = [];
            /**
            @internal
            */
            this.index = 0;
            this.bufferNode = null;
            if (node instanceof TreeNode) {
                this.yieldNode(node);
            }
            else {
                this._tree = node.context.parent;
                this.buffer = node.context;
                for (let n = node._parent; n; n = n._parent)
                    this.stack.unshift(n.index);
                this.bufferNode = node;
                this.yieldBuf(node.index);
            }
        }
        yieldNode(node) {
            if (!node)
                return false;
            this._tree = node;
            this.type = node.type;
            this.from = node.from;
            this.to = node.to;
            return true;
        }
        yieldBuf(index, type) {
            this.index = index;
            let { start, buffer } = this.buffer;
            this.type = type || buffer.set.types[buffer.buffer[index]];
            this.from = start + buffer.buffer[index + 1];
            this.to = start + buffer.buffer[index + 2];
            return true;
        }
        /**
        @internal
        */
        yield(node) {
            if (!node)
                return false;
            if (node instanceof TreeNode) {
                this.buffer = null;
                return this.yieldNode(node);
            }
            this.buffer = node.context;
            return this.yieldBuf(node.index, node.type);
        }
        /**
        @internal
        */
        toString() {
            return this.buffer ? this.buffer.buffer.childString(this.index) : this._tree.toString();
        }
        /**
        @internal
        */
        enterChild(dir, pos, side) {
            if (!this.buffer)
                return this.yield(this._tree.nextChild(dir < 0 ? this._tree._tree.children.length - 1 : 0, dir, pos, side, this.mode));
            let { buffer } = this.buffer;
            let index = buffer.findChild(this.index + 4, buffer.buffer[this.index + 3], dir, pos - this.buffer.start, side);
            if (index < 0)
                return false;
            this.stack.push(this.index);
            return this.yieldBuf(index);
        }
        /**
        Move the cursor to this node's first child. When this returns
        false, the node has no child, and the cursor has not been moved.
        */
        firstChild() { return this.enterChild(1, 0, 4 /* Side.DontCare */); }
        /**
        Move the cursor to this node's last child.
        */
        lastChild() { return this.enterChild(-1, 0, 4 /* Side.DontCare */); }
        /**
        Move the cursor to the first child that ends after `pos`.
        */
        childAfter(pos) { return this.enterChild(1, pos, 2 /* Side.After */); }
        /**
        Move to the last child that starts before `pos`.
        */
        childBefore(pos) { return this.enterChild(-1, pos, -2 /* Side.Before */); }
        /**
        Move the cursor to the child around `pos`. If side is -1 the
        child may end at that position, when 1 it may start there. This
        will also enter [overlaid](#common.MountedTree.overlay)
        [mounted](#common.NodeProp^mounted) trees unless `overlays` is
        set to false.
        */
        enter(pos, side, mode = this.mode) {
            if (!this.buffer)
                return this.yield(this._tree.enter(pos, side, mode));
            return mode & IterMode.ExcludeBuffers ? false : this.enterChild(1, pos, side);
        }
        /**
        Move to the node's parent node, if this isn't the top node.
        */
        parent() {
            if (!this.buffer)
                return this.yieldNode((this.mode & IterMode.IncludeAnonymous) ? this._tree._parent : this._tree.parent);
            if (this.stack.length)
                return this.yieldBuf(this.stack.pop());
            let parent = (this.mode & IterMode.IncludeAnonymous) ? this.buffer.parent : this.buffer.parent.nextSignificantParent();
            this.buffer = null;
            return this.yieldNode(parent);
        }
        /**
        @internal
        */
        sibling(dir) {
            if (!this.buffer)
                return !this._tree._parent ? false
                    : this.yield(this._tree.index < 0 ? null
                        : this._tree._parent.nextChild(this._tree.index + dir, dir, 0, 4 /* Side.DontCare */, this.mode));
            let { buffer } = this.buffer, d = this.stack.length - 1;
            if (dir < 0) {
                let parentStart = d < 0 ? 0 : this.stack[d] + 4;
                if (this.index != parentStart)
                    return this.yieldBuf(buffer.findChild(parentStart, this.index, -1, 0, 4 /* Side.DontCare */));
            }
            else {
                let after = buffer.buffer[this.index + 3];
                if (after < (d < 0 ? buffer.buffer.length : buffer.buffer[this.stack[d] + 3]))
                    return this.yieldBuf(after);
            }
            return d < 0 ? this.yield(this.buffer.parent.nextChild(this.buffer.index + dir, dir, 0, 4 /* Side.DontCare */, this.mode)) : false;
        }
        /**
        Move to this node's next sibling, if any.
        */
        nextSibling() { return this.sibling(1); }
        /**
        Move to this node's previous sibling, if any.
        */
        prevSibling() { return this.sibling(-1); }
        atLastNode(dir) {
            let index, parent, { buffer } = this;
            if (buffer) {
                if (dir > 0) {
                    if (this.index < buffer.buffer.buffer.length)
                        return false;
                }
                else {
                    for (let i = 0; i < this.index; i++)
                        if (buffer.buffer.buffer[i + 3] < this.index)
                            return false;
                }
                ({ index, parent } = buffer);
            }
            else {
                ({ index, _parent: parent } = this._tree);
            }
            for (; parent; { index, _parent: parent } = parent) {
                if (index > -1)
                    for (let i = index + dir, e = dir < 0 ? -1 : parent._tree.children.length; i != e; i += dir) {
                        let child = parent._tree.children[i];
                        if ((this.mode & IterMode.IncludeAnonymous) ||
                            child instanceof TreeBuffer ||
                            !child.type.isAnonymous ||
                            hasChild(child))
                            return false;
                    }
            }
            return true;
        }
        move(dir, enter) {
            if (enter && this.enterChild(dir, 0, 4 /* Side.DontCare */))
                return true;
            for (;;) {
                if (this.sibling(dir))
                    return true;
                if (this.atLastNode(dir) || !this.parent())
                    return false;
            }
        }
        /**
        Move to the next node in a
        [pre-order](https://en.wikipedia.org/wiki/Tree_traversal#Pre-order,_NLR)
        traversal, going from a node to its first child or, if the
        current node is empty or `enter` is false, its next sibling or
        the next sibling of the first parent node that has one.
        */
        next(enter = true) { return this.move(1, enter); }
        /**
        Move to the next node in a last-to-first pre-order traversal. A
        node is followed by its last child or, if it has none, its
        previous sibling or the previous sibling of the first parent
        node that has one.
        */
        prev(enter = true) { return this.move(-1, enter); }
        /**
        Move the cursor to the innermost node that covers `pos`. If
        `side` is -1, it will enter nodes that end at `pos`. If it is 1,
        it will enter nodes that start at `pos`.
        */
        moveTo(pos, side = 0) {
            // Move up to a node that actually holds the position, if possible
            while (this.from == this.to ||
                (side < 1 ? this.from >= pos : this.from > pos) ||
                (side > -1 ? this.to <= pos : this.to < pos))
                if (!this.parent())
                    break;
            // Then scan down into child nodes as far as possible
            while (this.enterChild(1, pos, side)) { }
            return this;
        }
        /**
        Get a [syntax node](#common.SyntaxNode) at the cursor's current
        position.
        */
        get node() {
            if (!this.buffer)
                return this._tree;
            let cache = this.bufferNode, result = null, depth = 0;
            if (cache && cache.context == this.buffer) {
                scan: for (let index = this.index, d = this.stack.length; d >= 0;) {
                    for (let c = cache; c; c = c._parent)
                        if (c.index == index) {
                            if (index == this.index)
                                return c;
                            result = c;
                            depth = d + 1;
                            break scan;
                        }
                    index = this.stack[--d];
                }
            }
            for (let i = depth; i < this.stack.length; i++)
                result = new BufferNode(this.buffer, result, this.stack[i]);
            return this.bufferNode = new BufferNode(this.buffer, result, this.index);
        }
        /**
        Get the [tree](#common.Tree) that represents the current node, if
        any. Will return null when the node is in a [tree
        buffer](#common.TreeBuffer).
        */
        get tree() {
            return this.buffer ? null : this._tree._tree;
        }
        /**
        Iterate over the current node and all its descendants, calling
        `enter` when entering a node and `leave`, if given, when leaving
        one. When `enter` returns `false`, any children of that node are
        skipped, and `leave` isn't called for it.
        */
        iterate(enter, leave) {
            for (let depth = 0;;) {
                let mustLeave = false;
                if (this.type.isAnonymous || enter(this) !== false) {
                    if (this.firstChild()) {
                        depth++;
                        continue;
                    }
                    if (!this.type.isAnonymous)
                        mustLeave = true;
                }
                for (;;) {
                    if (mustLeave && leave)
                        leave(this);
                    mustLeave = this.type.isAnonymous;
                    if (!depth)
                        return;
                    if (this.nextSibling())
                        break;
                    this.parent();
                    depth--;
                    mustLeave = true;
                }
            }
        }
        /**
        Test whether the current node matches a given context—a sequence
        of direct parent node names. Empty strings in the context array
        are treated as wildcards.
        */
        matchContext(context) {
            if (!this.buffer)
                return matchNodeContext(this.node.parent, context);
            let { buffer } = this.buffer, { types } = buffer.set;
            for (let i = context.length - 1, d = this.stack.length - 1; i >= 0; d--) {
                if (d < 0)
                    return matchNodeContext(this._tree, context, i);
                let type = types[buffer.buffer[this.stack[d]]];
                if (!type.isAnonymous) {
                    if (context[i] && context[i] != type.name)
                        return false;
                    i--;
                }
            }
            return true;
        }
    }
    function hasChild(tree) {
        return tree.children.some(ch => ch instanceof TreeBuffer || !ch.type.isAnonymous || hasChild(ch));
    }
    function buildTree(data) {
        var _a;
        let { buffer, nodeSet, maxBufferLength = DefaultBufferLength, reused = [], minRepeatType = nodeSet.types.length } = data;
        let cursor = Array.isArray(buffer) ? new FlatBufferCursor(buffer, buffer.length) : buffer;
        let types = nodeSet.types;
        let contextHash = 0, lookAhead = 0;
        function takeNode(parentStart, minPos, children, positions, inRepeat, depth) {
            let { id, start, end, size } = cursor;
            let lookAheadAtStart = lookAhead, contextAtStart = contextHash;
            while (size < 0) {
                cursor.next();
                if (size == -1 /* SpecialRecord.Reuse */) {
                    let node = reused[id];
                    children.push(node);
                    positions.push(start - parentStart);
                    return;
                }
                else if (size == -3 /* SpecialRecord.ContextChange */) { // Context change
                    contextHash = id;
                    return;
                }
                else if (size == -4 /* SpecialRecord.LookAhead */) {
                    lookAhead = id;
                    return;
                }
                else {
                    throw new RangeError(`Unrecognized record size: ${size}`);
                }
            }
            let type = types[id], node, buffer;
            let startPos = start - parentStart;
            if (end - start <= maxBufferLength && (buffer = findBufferSize(cursor.pos - minPos, inRepeat))) {
                // Small enough for a buffer, and no reused nodes inside
                let data = new Uint16Array(buffer.size - buffer.skip);
                let endPos = cursor.pos - buffer.size, index = data.length;
                while (cursor.pos > endPos)
                    index = copyToBuffer(buffer.start, data, index);
                node = new TreeBuffer(data, end - buffer.start, nodeSet);
                startPos = buffer.start - parentStart;
            }
            else { // Make it a node
                let endPos = cursor.pos - size;
                cursor.next();
                let localChildren = [], localPositions = [];
                let localInRepeat = id >= minRepeatType ? id : -1;
                let lastGroup = 0, lastEnd = end;
                while (cursor.pos > endPos) {
                    if (localInRepeat >= 0 && cursor.id == localInRepeat && cursor.size >= 0) {
                        if (cursor.end <= lastEnd - maxBufferLength) {
                            makeRepeatLeaf(localChildren, localPositions, start, lastGroup, cursor.end, lastEnd, localInRepeat, lookAheadAtStart, contextAtStart);
                            lastGroup = localChildren.length;
                            lastEnd = cursor.end;
                        }
                        cursor.next();
                    }
                    else if (depth > 2500 /* CutOff.Depth */) {
                        takeFlatNode(start, endPos, localChildren, localPositions);
                    }
                    else {
                        takeNode(start, endPos, localChildren, localPositions, localInRepeat, depth + 1);
                    }
                }
                if (localInRepeat >= 0 && lastGroup > 0 && lastGroup < localChildren.length)
                    makeRepeatLeaf(localChildren, localPositions, start, lastGroup, start, lastEnd, localInRepeat, lookAheadAtStart, contextAtStart);
                localChildren.reverse();
                localPositions.reverse();
                if (localInRepeat > -1 && lastGroup > 0) {
                    let make = makeBalanced(type, contextAtStart);
                    node = balanceRange(type, localChildren, localPositions, 0, localChildren.length, 0, end - start, make, make);
                }
                else {
                    node = makeTree(type, localChildren, localPositions, end - start, lookAheadAtStart - end, contextAtStart);
                }
            }
            children.push(node);
            positions.push(startPos);
        }
        function takeFlatNode(parentStart, minPos, children, positions) {
            let nodes = []; // Temporary, inverted array of leaf nodes found, with absolute positions
            let nodeCount = 0, stopAt = -1;
            while (cursor.pos > minPos) {
                let { id, start, end, size } = cursor;
                if (size > 4) { // Not a leaf
                    cursor.next();
                }
                else if (stopAt > -1 && start < stopAt) {
                    break;
                }
                else {
                    if (stopAt < 0)
                        stopAt = end - maxBufferLength;
                    nodes.push(id, start, end);
                    nodeCount++;
                    cursor.next();
                }
            }
            if (nodeCount) {
                let buffer = new Uint16Array(nodeCount * 4);
                let start = nodes[nodes.length - 2];
                for (let i = nodes.length - 3, j = 0; i >= 0; i -= 3) {
                    buffer[j++] = nodes[i];
                    buffer[j++] = nodes[i + 1] - start;
                    buffer[j++] = nodes[i + 2] - start;
                    buffer[j++] = j;
                }
                children.push(new TreeBuffer(buffer, nodes[2] - start, nodeSet));
                positions.push(start - parentStart);
            }
        }
        function makeBalanced(type, contextHash) {
            return (children, positions, length) => {
                let lookAhead = 0, lastI = children.length - 1, last, lookAheadProp;
                if (lastI >= 0 && (last = children[lastI]) instanceof Tree) {
                    if (!lastI && last.type == type && last.length == length)
                        return last;
                    if (lookAheadProp = last.prop(NodeProp.lookAhead))
                        lookAhead = positions[lastI] + last.length + lookAheadProp;
                }
                return makeTree(type, children, positions, length, lookAhead, contextHash);
            };
        }
        function makeRepeatLeaf(children, positions, base, i, from, to, type, lookAhead, contextHash) {
            let localChildren = [], localPositions = [];
            while (children.length > i) {
                localChildren.push(children.pop());
                localPositions.push(positions.pop() + base - from);
            }
            children.push(makeTree(nodeSet.types[type], localChildren, localPositions, to - from, lookAhead - to, contextHash));
            positions.push(from - base);
        }
        function makeTree(type, children, positions, length, lookAhead, contextHash, props) {
            if (contextHash) {
                let pair = [NodeProp.contextHash, contextHash];
                props = props ? [pair].concat(props) : [pair];
            }
            if (lookAhead > 25) {
                let pair = [NodeProp.lookAhead, lookAhead];
                props = props ? [pair].concat(props) : [pair];
            }
            return new Tree(type, children, positions, length, props);
        }
        function findBufferSize(maxSize, inRepeat) {
            // Scan through the buffer to find previous siblings that fit
            // together in a TreeBuffer, and don't contain any reused nodes
            // (which can't be stored in a buffer).
            // If `inRepeat` is > -1, ignore node boundaries of that type for
            // nesting, but make sure the end falls either at the start
            // (`maxSize`) or before such a node.
            let fork = cursor.fork();
            let size = 0, start = 0, skip = 0, minStart = fork.end - maxBufferLength;
            let result = { size: 0, start: 0, skip: 0 };
            scan: for (let minPos = fork.pos - maxSize; fork.pos > minPos;) {
                let nodeSize = fork.size;
                // Pretend nested repeat nodes of the same type don't exist
                if (fork.id == inRepeat && nodeSize >= 0) {
                    // Except that we store the current state as a valid return
                    // value.
                    result.size = size;
                    result.start = start;
                    result.skip = skip;
                    skip += 4;
                    size += 4;
                    fork.next();
                    continue;
                }
                let startPos = fork.pos - nodeSize;
                if (nodeSize < 0 || startPos < minPos || fork.start < minStart)
                    break;
                let localSkipped = fork.id >= minRepeatType ? 4 : 0;
                let nodeStart = fork.start;
                fork.next();
                while (fork.pos > startPos) {
                    if (fork.size < 0) {
                        if (fork.size == -3 /* SpecialRecord.ContextChange */)
                            localSkipped += 4;
                        else
                            break scan;
                    }
                    else if (fork.id >= minRepeatType) {
                        localSkipped += 4;
                    }
                    fork.next();
                }
                start = nodeStart;
                size += nodeSize;
                skip += localSkipped;
            }
            if (inRepeat < 0 || size == maxSize) {
                result.size = size;
                result.start = start;
                result.skip = skip;
            }
            return result.size > 4 ? result : undefined;
        }
        function copyToBuffer(bufferStart, buffer, index) {
            let { id, start, end, size } = cursor;
            cursor.next();
            if (size >= 0 && id < minRepeatType) {
                let startIndex = index;
                if (size > 4) {
                    let endPos = cursor.pos - (size - 4);
                    while (cursor.pos > endPos)
                        index = copyToBuffer(bufferStart, buffer, index);
                }
                buffer[--index] = startIndex;
                buffer[--index] = end - bufferStart;
                buffer[--index] = start - bufferStart;
                buffer[--index] = id;
            }
            else if (size == -3 /* SpecialRecord.ContextChange */) {
                contextHash = id;
            }
            else if (size == -4 /* SpecialRecord.LookAhead */) {
                lookAhead = id;
            }
            return index;
        }
        let children = [], positions = [];
        while (cursor.pos > 0)
            takeNode(data.start || 0, data.bufferStart || 0, children, positions, -1, 0);
        let length = (_a = data.length) !== null && _a !== void 0 ? _a : (children.length ? positions[0] + children[0].length : 0);
        return new Tree(types[data.topID], children.reverse(), positions.reverse(), length);
    }
    const nodeSizeCache = new WeakMap;
    function nodeSize(balanceType, node) {
        if (!balanceType.isAnonymous || node instanceof TreeBuffer || node.type != balanceType)
            return 1;
        let size = nodeSizeCache.get(node);
        if (size == null) {
            size = 1;
            for (let child of node.children) {
                if (child.type != balanceType || !(child instanceof Tree)) {
                    size = 1;
                    break;
                }
                size += nodeSize(balanceType, child);
            }
            nodeSizeCache.set(node, size);
        }
        return size;
    }
    function balanceRange(
    // The type the balanced tree's inner nodes.
    balanceType,
    // The direct children and their positions
    children, positions,
    // The index range in children/positions to use
    from, to,
    // The start position of the nodes, relative to their parent.
    start,
    // Length of the outer node
    length,
    // Function to build the top node of the balanced tree
    mkTop,
    // Function to build internal nodes for the balanced tree
    mkTree) {
        let total = 0;
        for (let i = from; i < to; i++)
            total += nodeSize(balanceType, children[i]);
        let maxChild = Math.ceil((total * 1.5) / 8 /* Balance.BranchFactor */);
        let localChildren = [], localPositions = [];
        function divide(children, positions, from, to, offset) {
            for (let i = from; i < to;) {
                let groupFrom = i, groupStart = positions[i], groupSize = nodeSize(balanceType, children[i]);
                i++;
                for (; i < to; i++) {
                    let nextSize = nodeSize(balanceType, children[i]);
                    if (groupSize + nextSize >= maxChild)
                        break;
                    groupSize += nextSize;
                }
                if (i == groupFrom + 1) {
                    if (groupSize > maxChild) {
                        let only = children[groupFrom]; // Only trees can have a size > 1
                        divide(only.children, only.positions, 0, only.children.length, positions[groupFrom] + offset);
                        continue;
                    }
                    localChildren.push(children[groupFrom]);
                }
                else {
                    let length = positions[i - 1] + children[i - 1].length - groupStart;
                    localChildren.push(balanceRange(balanceType, children, positions, groupFrom, i, groupStart, length, null, mkTree));
                }
                localPositions.push(groupStart + offset - start);
            }
        }
        divide(children, positions, from, to, 0);
        return (mkTop || mkTree)(localChildren, localPositions, length);
    }
    /**
    A superclass that parsers should extend.
    */
    class Parser {
        /**
        Start a parse, returning a [partial parse](#common.PartialParse)
        object. [`fragments`](#common.TreeFragment) can be passed in to
        make the parse incremental.

        By default, the entire input is parsed. You can pass `ranges`,
        which should be a sorted array of non-empty, non-overlapping
        ranges, to parse only those ranges. The tree returned in that
        case will start at `ranges[0].from`.
        */
        startParse(input, fragments, ranges) {
            if (typeof input == "string")
                input = new StringInput(input);
            ranges = !ranges ? [new Range(0, input.length)] : ranges.length ? ranges.map(r => new Range(r.from, r.to)) : [new Range(0, 0)];
            return this.createParse(input, fragments || [], ranges);
        }
        /**
        Run a full parse, returning the resulting tree.
        */
        parse(input, fragments, ranges) {
            let parse = this.startParse(input, fragments, ranges);
            for (;;) {
                let done = parse.advance();
                if (done)
                    return done;
            }
        }
    }
    class StringInput {
        constructor(string) {
            this.string = string;
        }
        get length() { return this.string.length; }
        chunk(from) { return this.string.slice(from); }
        get lineChunks() { return false; }
        read(from, to) { return this.string.slice(from, to); }
    }
    new NodeProp({ perNode: true });

    /**
    A parse stack. These are used internally by the parser to track
    parsing progress. They also provide some properties and methods
    that external code such as a tokenizer can use to get information
    about the parse state.
    */
    class Stack {
        /**
        @internal
        */
        constructor(
        /**
        The parse that this stack is part of @internal
        */
        p,
        /**
        Holds state, input pos, buffer index triplets for all but the
        top state @internal
        */
        stack,
        /**
        The current parse state @internal
        */
        state,
        // The position at which the next reduce should take place. This
        // can be less than `this.pos` when skipped expressions have been
        // added to the stack (which should be moved outside of the next
        // reduction)
        /**
        @internal
        */
        reducePos,
        /**
        The input position up to which this stack has parsed.
        */
        pos,
        /**
        The dynamic score of the stack, including dynamic precedence
        and error-recovery penalties
        @internal
        */
        score,
        // The output buffer. Holds (type, start, end, size) quads
        // representing nodes created by the parser, where `size` is
        // amount of buffer array entries covered by this node.
        /**
        @internal
        */
        buffer,
        // The base offset of the buffer. When stacks are split, the split
        // instance shared the buffer history with its parent up to
        // `bufferBase`, which is the absolute offset (including the
        // offset of previous splits) into the buffer at which this stack
        // starts writing.
        /**
        @internal
        */
        bufferBase,
        /**
        @internal
        */
        curContext,
        /**
        @internal
        */
        lookAhead = 0,
        // A parent stack from which this was split off, if any. This is
        // set up so that it always points to a stack that has some
        // additional buffer content, never to a stack with an equal
        // `bufferBase`.
        /**
        @internal
        */
        parent) {
            this.p = p;
            this.stack = stack;
            this.state = state;
            this.reducePos = reducePos;
            this.pos = pos;
            this.score = score;
            this.buffer = buffer;
            this.bufferBase = bufferBase;
            this.curContext = curContext;
            this.lookAhead = lookAhead;
            this.parent = parent;
        }
        /**
        @internal
        */
        toString() {
            return `[${this.stack.filter((_, i) => i % 3 == 0).concat(this.state)}]@${this.pos}${this.score ? "!" + this.score : ""}`;
        }
        // Start an empty stack
        /**
        @internal
        */
        static start(p, state, pos = 0) {
            let cx = p.parser.context;
            return new Stack(p, [], state, pos, pos, 0, [], 0, cx ? new StackContext(cx, cx.start) : null, 0, null);
        }
        /**
        The stack's current [context](#lr.ContextTracker) value, if
        any. Its type will depend on the context tracker's type
        parameter, or it will be `null` if there is no context
        tracker.
        */
        get context() { return this.curContext ? this.curContext.context : null; }
        // Push a state onto the stack, tracking its start position as well
        // as the buffer base at that point.
        /**
        @internal
        */
        pushState(state, start) {
            this.stack.push(this.state, start, this.bufferBase + this.buffer.length);
            this.state = state;
        }
        // Apply a reduce action
        /**
        @internal
        */
        reduce(action) {
            var _a;
            let depth = action >> 19 /* Action.ReduceDepthShift */, type = action & 65535 /* Action.ValueMask */;
            let { parser } = this.p;
            let lookaheadRecord = this.reducePos < this.pos - 25 /* Lookahead.Margin */;
            if (lookaheadRecord)
                this.setLookAhead(this.pos);
            let dPrec = parser.dynamicPrecedence(type);
            if (dPrec)
                this.score += dPrec;
            if (depth == 0) {
                this.pushState(parser.getGoto(this.state, type, true), this.reducePos);
                // Zero-depth reductions are a special case—they add stuff to
                // the stack without popping anything off.
                if (type < parser.minRepeatTerm)
                    this.storeNode(type, this.reducePos, this.reducePos, lookaheadRecord ? 8 : 4, true);
                this.reduceContext(type, this.reducePos);
                return;
            }
            // Find the base index into `this.stack`, content after which will
            // be dropped. Note that with `StayFlag` reductions we need to
            // consume two extra frames (the dummy parent node for the skipped
            // expression and the state that we'll be staying in, which should
            // be moved to `this.state`).
            let base = this.stack.length - ((depth - 1) * 3) - (action & 262144 /* Action.StayFlag */ ? 6 : 0);
            let start = base ? this.stack[base - 2] : this.p.ranges[0].from, size = this.reducePos - start;
            // This is a kludge to try and detect overly deep left-associative
            // trees, which will not increase the parse stack depth and thus
            // won't be caught by the regular stack-depth limit check.
            if (size >= 2000 /* Recover.MinBigReduction */ && !((_a = this.p.parser.nodeSet.types[type]) === null || _a === void 0 ? void 0 : _a.isAnonymous)) {
                if (start == this.p.lastBigReductionStart) {
                    this.p.bigReductionCount++;
                    this.p.lastBigReductionSize = size;
                }
                else if (this.p.lastBigReductionSize < size) {
                    this.p.bigReductionCount = 1;
                    this.p.lastBigReductionStart = start;
                    this.p.lastBigReductionSize = size;
                }
            }
            let bufferBase = base ? this.stack[base - 1] : 0, count = this.bufferBase + this.buffer.length - bufferBase;
            // Store normal terms or `R -> R R` repeat reductions
            if (type < parser.minRepeatTerm || (action & 131072 /* Action.RepeatFlag */)) {
                let pos = parser.stateFlag(this.state, 1 /* StateFlag.Skipped */) ? this.pos : this.reducePos;
                this.storeNode(type, start, pos, count + 4, true);
            }
            if (action & 262144 /* Action.StayFlag */) {
                this.state = this.stack[base];
            }
            else {
                let baseStateID = this.stack[base - 3];
                this.state = parser.getGoto(baseStateID, type, true);
            }
            while (this.stack.length > base)
                this.stack.pop();
            this.reduceContext(type, start);
        }
        // Shift a value into the buffer
        /**
        @internal
        */
        storeNode(term, start, end, size = 4, mustSink = false) {
            if (term == 0 /* Term.Err */ &&
                (!this.stack.length || this.stack[this.stack.length - 1] < this.buffer.length + this.bufferBase)) {
                // Try to omit/merge adjacent error nodes
                let cur = this, top = this.buffer.length;
                if (top == 0 && cur.parent) {
                    top = cur.bufferBase - cur.parent.bufferBase;
                    cur = cur.parent;
                }
                if (top > 0 && cur.buffer[top - 4] == 0 /* Term.Err */ && cur.buffer[top - 1] > -1) {
                    if (start == end)
                        return;
                    if (cur.buffer[top - 2] >= start) {
                        cur.buffer[top - 2] = end;
                        return;
                    }
                }
            }
            if (!mustSink || this.pos == end) { // Simple case, just append
                this.buffer.push(term, start, end, size);
            }
            else { // There may be skipped nodes that have to be moved forward
                let index = this.buffer.length;
                if (index > 0 && this.buffer[index - 4] != 0 /* Term.Err */) {
                    let mustMove = false;
                    for (let scan = index; scan > 0 && this.buffer[scan - 2] > end; scan -= 4) {
                        if (this.buffer[scan - 1] >= 0) {
                            mustMove = true;
                            break;
                        }
                    }
                    if (mustMove)
                        while (index > 0 && this.buffer[index - 2] > end) {
                            // Move this record forward
                            this.buffer[index] = this.buffer[index - 4];
                            this.buffer[index + 1] = this.buffer[index - 3];
                            this.buffer[index + 2] = this.buffer[index - 2];
                            this.buffer[index + 3] = this.buffer[index - 1];
                            index -= 4;
                            if (size > 4)
                                size -= 4;
                        }
                }
                this.buffer[index] = term;
                this.buffer[index + 1] = start;
                this.buffer[index + 2] = end;
                this.buffer[index + 3] = size;
            }
        }
        // Apply a shift action
        /**
        @internal
        */
        shift(action, type, start, end) {
            if (action & 131072 /* Action.GotoFlag */) {
                this.pushState(action & 65535 /* Action.ValueMask */, this.pos);
            }
            else if ((action & 262144 /* Action.StayFlag */) == 0) { // Regular shift
                let nextState = action, { parser } = this.p;
                if (end > this.pos || type <= parser.maxNode) {
                    this.pos = end;
                    if (!parser.stateFlag(nextState, 1 /* StateFlag.Skipped */))
                        this.reducePos = end;
                }
                this.pushState(nextState, start);
                this.shiftContext(type, start);
                if (type <= parser.maxNode)
                    this.buffer.push(type, start, end, 4);
            }
            else { // Shift-and-stay, which means this is a skipped token
                this.pos = end;
                this.shiftContext(type, start);
                if (type <= this.p.parser.maxNode)
                    this.buffer.push(type, start, end, 4);
            }
        }
        // Apply an action
        /**
        @internal
        */
        apply(action, next, nextStart, nextEnd) {
            if (action & 65536 /* Action.ReduceFlag */)
                this.reduce(action);
            else
                this.shift(action, next, nextStart, nextEnd);
        }
        // Add a prebuilt (reused) node into the buffer.
        /**
        @internal
        */
        useNode(value, next) {
            let index = this.p.reused.length - 1;
            if (index < 0 || this.p.reused[index] != value) {
                this.p.reused.push(value);
                index++;
            }
            let start = this.pos;
            this.reducePos = this.pos = start + value.length;
            this.pushState(next, start);
            this.buffer.push(index, start, this.reducePos, -1 /* size == -1 means this is a reused value */);
            if (this.curContext)
                this.updateContext(this.curContext.tracker.reuse(this.curContext.context, value, this, this.p.stream.reset(this.pos - value.length)));
        }
        // Split the stack. Due to the buffer sharing and the fact
        // that `this.stack` tends to stay quite shallow, this isn't very
        // expensive.
        /**
        @internal
        */
        split() {
            let parent = this;
            let off = parent.buffer.length;
            // Because the top of the buffer (after this.pos) may be mutated
            // to reorder reductions and skipped tokens, and shared buffers
            // should be immutable, this copies any outstanding skipped tokens
            // to the new buffer, and puts the base pointer before them.
            while (off > 0 && parent.buffer[off - 2] > parent.reducePos)
                off -= 4;
            let buffer = parent.buffer.slice(off), base = parent.bufferBase + off;
            // Make sure parent points to an actual parent with content, if there is such a parent.
            while (parent && base == parent.bufferBase)
                parent = parent.parent;
            return new Stack(this.p, this.stack.slice(), this.state, this.reducePos, this.pos, this.score, buffer, base, this.curContext, this.lookAhead, parent);
        }
        // Try to recover from an error by 'deleting' (ignoring) one token.
        /**
        @internal
        */
        recoverByDelete(next, nextEnd) {
            let isNode = next <= this.p.parser.maxNode;
            if (isNode)
                this.storeNode(next, this.pos, nextEnd, 4);
            this.storeNode(0 /* Term.Err */, this.pos, nextEnd, isNode ? 8 : 4);
            this.pos = this.reducePos = nextEnd;
            this.score -= 190 /* Recover.Delete */;
        }
        /**
        Check if the given term would be able to be shifted (optionally
        after some reductions) on this stack. This can be useful for
        external tokenizers that want to make sure they only provide a
        given token when it applies.
        */
        canShift(term) {
            for (let sim = new SimulatedStack(this);;) {
                let action = this.p.parser.stateSlot(sim.state, 4 /* ParseState.DefaultReduce */) || this.p.parser.hasAction(sim.state, term);
                if (action == 0)
                    return false;
                if ((action & 65536 /* Action.ReduceFlag */) == 0)
                    return true;
                sim.reduce(action);
            }
        }
        // Apply up to Recover.MaxNext recovery actions that conceptually
        // inserts some missing token or rule.
        /**
        @internal
        */
        recoverByInsert(next) {
            if (this.stack.length >= 300 /* Recover.MaxInsertStackDepth */)
                return [];
            let nextStates = this.p.parser.nextStates(this.state);
            if (nextStates.length > 4 /* Recover.MaxNext */ << 1 || this.stack.length >= 120 /* Recover.DampenInsertStackDepth */) {
                let best = [];
                for (let i = 0, s; i < nextStates.length; i += 2) {
                    if ((s = nextStates[i + 1]) != this.state && this.p.parser.hasAction(s, next))
                        best.push(nextStates[i], s);
                }
                if (this.stack.length < 120 /* Recover.DampenInsertStackDepth */)
                    for (let i = 0; best.length < 4 /* Recover.MaxNext */ << 1 && i < nextStates.length; i += 2) {
                        let s = nextStates[i + 1];
                        if (!best.some((v, i) => (i & 1) && v == s))
                            best.push(nextStates[i], s);
                    }
                nextStates = best;
            }
            let result = [];
            for (let i = 0; i < nextStates.length && result.length < 4 /* Recover.MaxNext */; i += 2) {
                let s = nextStates[i + 1];
                if (s == this.state)
                    continue;
                let stack = this.split();
                stack.pushState(s, this.pos);
                stack.storeNode(0 /* Term.Err */, stack.pos, stack.pos, 4, true);
                stack.shiftContext(nextStates[i], this.pos);
                stack.reducePos = this.pos;
                stack.score -= 200 /* Recover.Insert */;
                result.push(stack);
            }
            return result;
        }
        // Force a reduce, if possible. Return false if that can't
        // be done.
        /**
        @internal
        */
        forceReduce() {
            let { parser } = this.p;
            let reduce = parser.stateSlot(this.state, 5 /* ParseState.ForcedReduce */);
            if ((reduce & 65536 /* Action.ReduceFlag */) == 0)
                return false;
            if (!parser.validAction(this.state, reduce)) {
                let depth = reduce >> 19 /* Action.ReduceDepthShift */, term = reduce & 65535 /* Action.ValueMask */;
                let target = this.stack.length - depth * 3;
                if (target < 0 || parser.getGoto(this.stack[target], term, false) < 0) {
                    let backup = this.findForcedReduction();
                    if (backup == null)
                        return false;
                    reduce = backup;
                }
                this.storeNode(0 /* Term.Err */, this.pos, this.pos, 4, true);
                this.score -= 100 /* Recover.Reduce */;
            }
            this.reducePos = this.pos;
            this.reduce(reduce);
            return true;
        }
        /**
        Try to scan through the automaton to find some kind of reduction
        that can be applied. Used when the regular ForcedReduce field
        isn't a valid action. @internal
        */
        findForcedReduction() {
            let { parser } = this.p, seen = [];
            let explore = (state, depth) => {
                if (seen.includes(state))
                    return;
                seen.push(state);
                return parser.allActions(state, (action) => {
                    if (action & (262144 /* Action.StayFlag */ | 131072 /* Action.GotoFlag */)) ;
                    else if (action & 65536 /* Action.ReduceFlag */) {
                        let rDepth = (action >> 19 /* Action.ReduceDepthShift */) - depth;
                        if (rDepth > 1) {
                            let term = action & 65535 /* Action.ValueMask */, target = this.stack.length - rDepth * 3;
                            if (target >= 0 && parser.getGoto(this.stack[target], term, false) >= 0)
                                return (rDepth << 19 /* Action.ReduceDepthShift */) | 65536 /* Action.ReduceFlag */ | term;
                        }
                    }
                    else {
                        let found = explore(action, depth + 1);
                        if (found != null)
                            return found;
                    }
                });
            };
            return explore(this.state, 0);
        }
        /**
        @internal
        */
        forceAll() {
            while (!this.p.parser.stateFlag(this.state, 2 /* StateFlag.Accepting */)) {
                if (!this.forceReduce()) {
                    this.storeNode(0 /* Term.Err */, this.pos, this.pos, 4, true);
                    break;
                }
            }
            return this;
        }
        /**
        Check whether this state has no further actions (assumed to be a direct descendant of the
        top state, since any other states must be able to continue
        somehow). @internal
        */
        get deadEnd() {
            if (this.stack.length != 3)
                return false;
            let { parser } = this.p;
            return parser.data[parser.stateSlot(this.state, 1 /* ParseState.Actions */)] == 65535 /* Seq.End */ &&
                !parser.stateSlot(this.state, 4 /* ParseState.DefaultReduce */);
        }
        /**
        Restart the stack (put it back in its start state). Only safe
        when this.stack.length == 3 (state is directly below the top
        state). @internal
        */
        restart() {
            this.storeNode(0 /* Term.Err */, this.pos, this.pos, 4, true);
            this.state = this.stack[0];
            this.stack.length = 0;
        }
        /**
        @internal
        */
        sameState(other) {
            if (this.state != other.state || this.stack.length != other.stack.length)
                return false;
            for (let i = 0; i < this.stack.length; i += 3)
                if (this.stack[i] != other.stack[i])
                    return false;
            return true;
        }
        /**
        Get the parser used by this stack.
        */
        get parser() { return this.p.parser; }
        /**
        Test whether a given dialect (by numeric ID, as exported from
        the terms file) is enabled.
        */
        dialectEnabled(dialectID) { return this.p.parser.dialect.flags[dialectID]; }
        shiftContext(term, start) {
            if (this.curContext)
                this.updateContext(this.curContext.tracker.shift(this.curContext.context, term, this, this.p.stream.reset(start)));
        }
        reduceContext(term, start) {
            if (this.curContext)
                this.updateContext(this.curContext.tracker.reduce(this.curContext.context, term, this, this.p.stream.reset(start)));
        }
        /**
        @internal
        */
        emitContext() {
            let last = this.buffer.length - 1;
            if (last < 0 || this.buffer[last] != -3)
                this.buffer.push(this.curContext.hash, this.pos, this.pos, -3);
        }
        /**
        @internal
        */
        emitLookAhead() {
            let last = this.buffer.length - 1;
            if (last < 0 || this.buffer[last] != -4)
                this.buffer.push(this.lookAhead, this.pos, this.pos, -4);
        }
        updateContext(context) {
            if (context != this.curContext.context) {
                let newCx = new StackContext(this.curContext.tracker, context);
                if (newCx.hash != this.curContext.hash)
                    this.emitContext();
                this.curContext = newCx;
            }
        }
        /**
        @internal
        */
        setLookAhead(lookAhead) {
            if (lookAhead > this.lookAhead) {
                this.emitLookAhead();
                this.lookAhead = lookAhead;
            }
        }
        /**
        @internal
        */
        close() {
            if (this.curContext && this.curContext.tracker.strict)
                this.emitContext();
            if (this.lookAhead > 0)
                this.emitLookAhead();
        }
    }
    class StackContext {
        constructor(tracker, context) {
            this.tracker = tracker;
            this.context = context;
            this.hash = tracker.strict ? tracker.hash(context) : 0;
        }
    }
    // Used to cheaply run some reductions to scan ahead without mutating
    // an entire stack
    class SimulatedStack {
        constructor(start) {
            this.start = start;
            this.state = start.state;
            this.stack = start.stack;
            this.base = this.stack.length;
        }
        reduce(action) {
            let term = action & 65535 /* Action.ValueMask */, depth = action >> 19 /* Action.ReduceDepthShift */;
            if (depth == 0) {
                if (this.stack == this.start.stack)
                    this.stack = this.stack.slice();
                this.stack.push(this.state, 0, 0);
                this.base += 3;
            }
            else {
                this.base -= (depth - 1) * 3;
            }
            let goto = this.start.p.parser.getGoto(this.stack[this.base - 3], term, true);
            this.state = goto;
        }
    }
    // This is given to `Tree.build` to build a buffer, and encapsulates
    // the parent-stack-walking necessary to read the nodes.
    class StackBufferCursor {
        constructor(stack, pos, index) {
            this.stack = stack;
            this.pos = pos;
            this.index = index;
            this.buffer = stack.buffer;
            if (this.index == 0)
                this.maybeNext();
        }
        static create(stack, pos = stack.bufferBase + stack.buffer.length) {
            return new StackBufferCursor(stack, pos, pos - stack.bufferBase);
        }
        maybeNext() {
            let next = this.stack.parent;
            if (next != null) {
                this.index = this.stack.bufferBase - next.bufferBase;
                this.stack = next;
                this.buffer = next.buffer;
            }
        }
        get id() { return this.buffer[this.index - 4]; }
        get start() { return this.buffer[this.index - 3]; }
        get end() { return this.buffer[this.index - 2]; }
        get size() { return this.buffer[this.index - 1]; }
        next() {
            this.index -= 4;
            this.pos -= 4;
            if (this.index == 0)
                this.maybeNext();
        }
        fork() {
            return new StackBufferCursor(this.stack, this.pos, this.index);
        }
    }

    // See lezer-generator/src/encode.ts for comments about the encoding
    // used here
    function decodeArray(input, Type = Uint16Array) {
        if (typeof input != "string")
            return input;
        let array = null;
        for (let pos = 0, out = 0; pos < input.length;) {
            let value = 0;
            for (;;) {
                let next = input.charCodeAt(pos++), stop = false;
                if (next == 126 /* Encode.BigValCode */) {
                    value = 65535 /* Encode.BigVal */;
                    break;
                }
                if (next >= 92 /* Encode.Gap2 */)
                    next--;
                if (next >= 34 /* Encode.Gap1 */)
                    next--;
                let digit = next - 32 /* Encode.Start */;
                if (digit >= 46 /* Encode.Base */) {
                    digit -= 46 /* Encode.Base */;
                    stop = true;
                }
                value += digit;
                if (stop)
                    break;
                value *= 46 /* Encode.Base */;
            }
            if (array)
                array[out++] = value;
            else
                array = new Type(value);
        }
        return array;
    }

    class CachedToken {
        constructor() {
            this.start = -1;
            this.value = -1;
            this.end = -1;
            this.extended = -1;
            this.lookAhead = 0;
            this.mask = 0;
            this.context = 0;
        }
    }
    const nullToken = new CachedToken;
    /**
    [Tokenizers](#lr.ExternalTokenizer) interact with the input
    through this interface. It presents the input as a stream of
    characters, tracking lookahead and hiding the complexity of
    [ranges](#common.Parser.parse^ranges) from tokenizer code.
    */
    class InputStream {
        /**
        @internal
        */
        constructor(
        /**
        @internal
        */
        input,
        /**
        @internal
        */
        ranges) {
            this.input = input;
            this.ranges = ranges;
            /**
            @internal
            */
            this.chunk = "";
            /**
            @internal
            */
            this.chunkOff = 0;
            /**
            Backup chunk
            */
            this.chunk2 = "";
            this.chunk2Pos = 0;
            /**
            The character code of the next code unit in the input, or -1
            when the stream is at the end of the input.
            */
            this.next = -1;
            /**
            @internal
            */
            this.token = nullToken;
            this.rangeIndex = 0;
            this.pos = this.chunkPos = ranges[0].from;
            this.range = ranges[0];
            this.end = ranges[ranges.length - 1].to;
            this.readNext();
        }
        /**
        @internal
        */
        resolveOffset(offset, assoc) {
            let range = this.range, index = this.rangeIndex;
            let pos = this.pos + offset;
            while (pos < range.from) {
                if (!index)
                    return null;
                let next = this.ranges[--index];
                pos -= range.from - next.to;
                range = next;
            }
            while (assoc < 0 ? pos > range.to : pos >= range.to) {
                if (index == this.ranges.length - 1)
                    return null;
                let next = this.ranges[++index];
                pos += next.from - range.to;
                range = next;
            }
            return pos;
        }
        /**
        @internal
        */
        clipPos(pos) {
            if (pos >= this.range.from && pos < this.range.to)
                return pos;
            for (let range of this.ranges)
                if (range.to > pos)
                    return Math.max(pos, range.from);
            return this.end;
        }
        /**
        Look at a code unit near the stream position. `.peek(0)` equals
        `.next`, `.peek(-1)` gives you the previous character, and so
        on.

        Note that looking around during tokenizing creates dependencies
        on potentially far-away content, which may reduce the
        effectiveness incremental parsing—when looking forward—or even
        cause invalid reparses when looking backward more than 25 code
        units, since the library does not track lookbehind.
        */
        peek(offset) {
            let idx = this.chunkOff + offset, pos, result;
            if (idx >= 0 && idx < this.chunk.length) {
                pos = this.pos + offset;
                result = this.chunk.charCodeAt(idx);
            }
            else {
                let resolved = this.resolveOffset(offset, 1);
                if (resolved == null)
                    return -1;
                pos = resolved;
                if (pos >= this.chunk2Pos && pos < this.chunk2Pos + this.chunk2.length) {
                    result = this.chunk2.charCodeAt(pos - this.chunk2Pos);
                }
                else {
                    let i = this.rangeIndex, range = this.range;
                    while (range.to <= pos)
                        range = this.ranges[++i];
                    this.chunk2 = this.input.chunk(this.chunk2Pos = pos);
                    if (pos + this.chunk2.length > range.to)
                        this.chunk2 = this.chunk2.slice(0, range.to - pos);
                    result = this.chunk2.charCodeAt(0);
                }
            }
            if (pos >= this.token.lookAhead)
                this.token.lookAhead = pos + 1;
            return result;
        }
        /**
        Accept a token. By default, the end of the token is set to the
        current stream position, but you can pass an offset (relative to
        the stream position) to change that.
        */
        acceptToken(token, endOffset = 0) {
            let end = endOffset ? this.resolveOffset(endOffset, -1) : this.pos;
            if (end == null || end < this.token.start)
                throw new RangeError("Token end out of bounds");
            this.token.value = token;
            this.token.end = end;
        }
        /**
        Accept a token ending at a specific given position.
        */
        acceptTokenTo(token, endPos) {
            this.token.value = token;
            this.token.end = endPos;
        }
        getChunk() {
            if (this.pos >= this.chunk2Pos && this.pos < this.chunk2Pos + this.chunk2.length) {
                let { chunk, chunkPos } = this;
                this.chunk = this.chunk2;
                this.chunkPos = this.chunk2Pos;
                this.chunk2 = chunk;
                this.chunk2Pos = chunkPos;
                this.chunkOff = this.pos - this.chunkPos;
            }
            else {
                this.chunk2 = this.chunk;
                this.chunk2Pos = this.chunkPos;
                let nextChunk = this.input.chunk(this.pos);
                let end = this.pos + nextChunk.length;
                this.chunk = end > this.range.to ? nextChunk.slice(0, this.range.to - this.pos) : nextChunk;
                this.chunkPos = this.pos;
                this.chunkOff = 0;
            }
        }
        readNext() {
            if (this.chunkOff >= this.chunk.length) {
                this.getChunk();
                if (this.chunkOff == this.chunk.length)
                    return this.next = -1;
            }
            return this.next = this.chunk.charCodeAt(this.chunkOff);
        }
        /**
        Move the stream forward N (defaults to 1) code units. Returns
        the new value of [`next`](#lr.InputStream.next).
        */
        advance(n = 1) {
            this.chunkOff += n;
            while (this.pos + n >= this.range.to) {
                if (this.rangeIndex == this.ranges.length - 1)
                    return this.setDone();
                n -= this.range.to - this.pos;
                this.range = this.ranges[++this.rangeIndex];
                this.pos = this.range.from;
            }
            this.pos += n;
            if (this.pos >= this.token.lookAhead)
                this.token.lookAhead = this.pos + 1;
            return this.readNext();
        }
        setDone() {
            this.pos = this.chunkPos = this.end;
            this.range = this.ranges[this.rangeIndex = this.ranges.length - 1];
            this.chunk = "";
            return this.next = -1;
        }
        /**
        @internal
        */
        reset(pos, token) {
            if (token) {
                this.token = token;
                token.start = pos;
                token.lookAhead = pos + 1;
                token.value = token.extended = -1;
            }
            else {
                this.token = nullToken;
            }
            if (this.pos != pos) {
                this.pos = pos;
                if (pos == this.end) {
                    this.setDone();
                    return this;
                }
                while (pos < this.range.from)
                    this.range = this.ranges[--this.rangeIndex];
                while (pos >= this.range.to)
                    this.range = this.ranges[++this.rangeIndex];
                if (pos >= this.chunkPos && pos < this.chunkPos + this.chunk.length) {
                    this.chunkOff = pos - this.chunkPos;
                }
                else {
                    this.chunk = "";
                    this.chunkOff = 0;
                }
                this.readNext();
            }
            return this;
        }
        /**
        @internal
        */
        read(from, to) {
            if (from >= this.chunkPos && to <= this.chunkPos + this.chunk.length)
                return this.chunk.slice(from - this.chunkPos, to - this.chunkPos);
            if (from >= this.chunk2Pos && to <= this.chunk2Pos + this.chunk2.length)
                return this.chunk2.slice(from - this.chunk2Pos, to - this.chunk2Pos);
            if (from >= this.range.from && to <= this.range.to)
                return this.input.read(from, to);
            let result = "";
            for (let r of this.ranges) {
                if (r.from >= to)
                    break;
                if (r.to > from)
                    result += this.input.read(Math.max(r.from, from), Math.min(r.to, to));
            }
            return result;
        }
    }
    /**
    @internal
    */
    class TokenGroup {
        constructor(data, id) {
            this.data = data;
            this.id = id;
        }
        token(input, stack) {
            let { parser } = stack.p;
            readToken(this.data, input, stack, this.id, parser.data, parser.tokenPrecTable);
        }
    }
    TokenGroup.prototype.contextual = TokenGroup.prototype.fallback = TokenGroup.prototype.extend = false;
    /**
    @hide
    */
    class LocalTokenGroup {
        constructor(data, precTable, elseToken) {
            this.precTable = precTable;
            this.elseToken = elseToken;
            this.data = typeof data == "string" ? decodeArray(data) : data;
        }
        token(input, stack) {
            let start = input.pos, skipped = 0;
            for (;;) {
                let atEof = input.next < 0, nextPos = input.resolveOffset(1, 1);
                readToken(this.data, input, stack, 0, this.data, this.precTable);
                if (input.token.value > -1)
                    break;
                if (this.elseToken == null)
                    return;
                if (!atEof)
                    skipped++;
                if (nextPos == null)
                    break;
                input.reset(nextPos, input.token);
            }
            if (skipped) {
                input.reset(start, input.token);
                input.acceptToken(this.elseToken, skipped);
            }
        }
    }
    LocalTokenGroup.prototype.contextual = TokenGroup.prototype.fallback = TokenGroup.prototype.extend = false;
    /**
    `@external tokens` declarations in the grammar should resolve to
    an instance of this class.
    */
    class ExternalTokenizer {
        /**
        Create a tokenizer. The first argument is the function that,
        given an input stream, scans for the types of tokens it
        recognizes at the stream's position, and calls
        [`acceptToken`](#lr.InputStream.acceptToken) when it finds
        one.
        */
        constructor(
        /**
        @internal
        */
        token, options = {}) {
            this.token = token;
            this.contextual = !!options.contextual;
            this.fallback = !!options.fallback;
            this.extend = !!options.extend;
        }
    }
    // Tokenizer data is stored a big uint16 array containing, for each
    // state:
    //
    //  - A group bitmask, indicating what token groups are reachable from
    //    this state, so that paths that can only lead to tokens not in
    //    any of the current groups can be cut off early.
    //
    //  - The position of the end of the state's sequence of accepting
    //    tokens
    //
    //  - The number of outgoing edges for the state
    //
    //  - The accepting tokens, as (token id, group mask) pairs
    //
    //  - The outgoing edges, as (start character, end character, state
    //    index) triples, with end character being exclusive
    //
    // This function interprets that data, running through a stream as
    // long as new states with the a matching group mask can be reached,
    // and updating `input.token` when it matches a token.
    function readToken(data, input, stack, group, precTable, precOffset) {
        let state = 0, groupMask = 1 << group, { dialect } = stack.p.parser;
        scan: for (;;) {
            if ((groupMask & data[state]) == 0)
                break;
            let accEnd = data[state + 1];
            // Check whether this state can lead to a token in the current group
            // Accept tokens in this state, possibly overwriting
            // lower-precedence / shorter tokens
            for (let i = state + 3; i < accEnd; i += 2)
                if ((data[i + 1] & groupMask) > 0) {
                    let term = data[i];
                    if (dialect.allows(term) &&
                        (input.token.value == -1 || input.token.value == term ||
                            overrides(term, input.token.value, precTable, precOffset))) {
                        input.acceptToken(term);
                        break;
                    }
                }
            let next = input.next, low = 0, high = data[state + 2];
            // Special case for EOF
            if (input.next < 0 && high > low && data[accEnd + high * 3 - 3] == 65535 /* Seq.End */) {
                state = data[accEnd + high * 3 - 1];
                continue scan;
            }
            // Do a binary search on the state's edges
            for (; low < high;) {
                let mid = (low + high) >> 1;
                let index = accEnd + mid + (mid << 1);
                let from = data[index], to = data[index + 1] || 0x10000;
                if (next < from)
                    high = mid;
                else if (next >= to)
                    low = mid + 1;
                else {
                    state = data[index + 2];
                    input.advance();
                    continue scan;
                }
            }
            break;
        }
    }
    function findOffset(data, start, term) {
        for (let i = start, next; (next = data[i]) != 65535 /* Seq.End */; i++)
            if (next == term)
                return i - start;
        return -1;
    }
    function overrides(token, prev, tableData, tableOffset) {
        let iPrev = findOffset(tableData, tableOffset, prev);
        return iPrev < 0 || findOffset(tableData, tableOffset, token) < iPrev;
    }

    // Environment variable used to control console output
    const verbose = typeof process != "undefined" && process.env && /\bparse\b/.test(process.env.LOG);
    let stackIDs = null;
    function cutAt(tree, pos, side) {
        let cursor = tree.cursor(IterMode.IncludeAnonymous);
        cursor.moveTo(pos);
        for (;;) {
            if (!(side < 0 ? cursor.childBefore(pos) : cursor.childAfter(pos)))
                for (;;) {
                    if ((side < 0 ? cursor.to < pos : cursor.from > pos) && !cursor.type.isError)
                        return side < 0 ? Math.max(0, Math.min(cursor.to - 1, pos - 25 /* Lookahead.Margin */))
                            : Math.min(tree.length, Math.max(cursor.from + 1, pos + 25 /* Lookahead.Margin */));
                    if (side < 0 ? cursor.prevSibling() : cursor.nextSibling())
                        break;
                    if (!cursor.parent())
                        return side < 0 ? 0 : tree.length;
                }
        }
    }
    class FragmentCursor {
        constructor(fragments, nodeSet) {
            this.fragments = fragments;
            this.nodeSet = nodeSet;
            this.i = 0;
            this.fragment = null;
            this.safeFrom = -1;
            this.safeTo = -1;
            this.trees = [];
            this.start = [];
            this.index = [];
            this.nextFragment();
        }
        nextFragment() {
            let fr = this.fragment = this.i == this.fragments.length ? null : this.fragments[this.i++];
            if (fr) {
                this.safeFrom = fr.openStart ? cutAt(fr.tree, fr.from + fr.offset, 1) - fr.offset : fr.from;
                this.safeTo = fr.openEnd ? cutAt(fr.tree, fr.to + fr.offset, -1) - fr.offset : fr.to;
                while (this.trees.length) {
                    this.trees.pop();
                    this.start.pop();
                    this.index.pop();
                }
                this.trees.push(fr.tree);
                this.start.push(-fr.offset);
                this.index.push(0);
                this.nextStart = this.safeFrom;
            }
            else {
                this.nextStart = 1e9;
            }
        }
        // `pos` must be >= any previously given `pos` for this cursor
        nodeAt(pos) {
            if (pos < this.nextStart)
                return null;
            while (this.fragment && this.safeTo <= pos)
                this.nextFragment();
            if (!this.fragment)
                return null;
            for (;;) {
                let last = this.trees.length - 1;
                if (last < 0) { // End of tree
                    this.nextFragment();
                    return null;
                }
                let top = this.trees[last], index = this.index[last];
                if (index == top.children.length) {
                    this.trees.pop();
                    this.start.pop();
                    this.index.pop();
                    continue;
                }
                let next = top.children[index];
                let start = this.start[last] + top.positions[index];
                if (start > pos) {
                    this.nextStart = start;
                    return null;
                }
                if (next instanceof Tree) {
                    if (start == pos) {
                        if (start < this.safeFrom)
                            return null;
                        let end = start + next.length;
                        if (end <= this.safeTo) {
                            let lookAhead = next.prop(NodeProp.lookAhead);
                            if (!lookAhead || end + lookAhead < this.fragment.to)
                                return next;
                        }
                    }
                    this.index[last]++;
                    if (start + next.length >= Math.max(this.safeFrom, pos)) { // Enter this node
                        this.trees.push(next);
                        this.start.push(start);
                        this.index.push(0);
                    }
                }
                else {
                    this.index[last]++;
                    this.nextStart = start + next.length;
                }
            }
        }
    }
    class TokenCache {
        constructor(parser, stream) {
            this.stream = stream;
            this.tokens = [];
            this.mainToken = null;
            this.actions = [];
            this.tokens = parser.tokenizers.map(_ => new CachedToken);
        }
        getActions(stack) {
            let actionIndex = 0;
            let main = null;
            let { parser } = stack.p, { tokenizers } = parser;
            let mask = parser.stateSlot(stack.state, 3 /* ParseState.TokenizerMask */);
            let context = stack.curContext ? stack.curContext.hash : 0;
            let lookAhead = 0;
            for (let i = 0; i < tokenizers.length; i++) {
                if (((1 << i) & mask) == 0)
                    continue;
                let tokenizer = tokenizers[i], token = this.tokens[i];
                if (main && !tokenizer.fallback)
                    continue;
                if (tokenizer.contextual || token.start != stack.pos || token.mask != mask || token.context != context) {
                    this.updateCachedToken(token, tokenizer, stack);
                    token.mask = mask;
                    token.context = context;
                }
                if (token.lookAhead > token.end + 25 /* Lookahead.Margin */)
                    lookAhead = Math.max(token.lookAhead, lookAhead);
                if (token.value != 0 /* Term.Err */) {
                    let startIndex = actionIndex;
                    if (token.extended > -1)
                        actionIndex = this.addActions(stack, token.extended, token.end, actionIndex);
                    actionIndex = this.addActions(stack, token.value, token.end, actionIndex);
                    if (!tokenizer.extend) {
                        main = token;
                        if (actionIndex > startIndex)
                            break;
                    }
                }
            }
            while (this.actions.length > actionIndex)
                this.actions.pop();
            if (lookAhead)
                stack.setLookAhead(lookAhead);
            if (!main && stack.pos == this.stream.end) {
                main = new CachedToken;
                main.value = stack.p.parser.eofTerm;
                main.start = main.end = stack.pos;
                actionIndex = this.addActions(stack, main.value, main.end, actionIndex);
            }
            this.mainToken = main;
            return this.actions;
        }
        getMainToken(stack) {
            if (this.mainToken)
                return this.mainToken;
            let main = new CachedToken, { pos, p } = stack;
            main.start = pos;
            main.end = Math.min(pos + 1, p.stream.end);
            main.value = pos == p.stream.end ? p.parser.eofTerm : 0 /* Term.Err */;
            return main;
        }
        updateCachedToken(token, tokenizer, stack) {
            let start = this.stream.clipPos(stack.pos);
            tokenizer.token(this.stream.reset(start, token), stack);
            if (token.value > -1) {
                let { parser } = stack.p;
                for (let i = 0; i < parser.specialized.length; i++)
                    if (parser.specialized[i] == token.value) {
                        let result = parser.specializers[i](this.stream.read(token.start, token.end), stack);
                        if (result >= 0 && stack.p.parser.dialect.allows(result >> 1)) {
                            if ((result & 1) == 0 /* Specialize.Specialize */)
                                token.value = result >> 1;
                            else
                                token.extended = result >> 1;
                            break;
                        }
                    }
            }
            else {
                token.value = 0 /* Term.Err */;
                token.end = this.stream.clipPos(start + 1);
            }
        }
        putAction(action, token, end, index) {
            // Don't add duplicate actions
            for (let i = 0; i < index; i += 3)
                if (this.actions[i] == action)
                    return index;
            this.actions[index++] = action;
            this.actions[index++] = token;
            this.actions[index++] = end;
            return index;
        }
        addActions(stack, token, end, index) {
            let { state } = stack, { parser } = stack.p, { data } = parser;
            for (let set = 0; set < 2; set++) {
                for (let i = parser.stateSlot(state, set ? 2 /* ParseState.Skip */ : 1 /* ParseState.Actions */);; i += 3) {
                    if (data[i] == 65535 /* Seq.End */) {
                        if (data[i + 1] == 1 /* Seq.Next */) {
                            i = pair(data, i + 2);
                        }
                        else {
                            if (index == 0 && data[i + 1] == 2 /* Seq.Other */)
                                index = this.putAction(pair(data, i + 2), token, end, index);
                            break;
                        }
                    }
                    if (data[i] == token)
                        index = this.putAction(pair(data, i + 1), token, end, index);
                }
            }
            return index;
        }
    }
    class Parse {
        constructor(parser, input, fragments, ranges) {
            this.parser = parser;
            this.input = input;
            this.ranges = ranges;
            this.recovering = 0;
            this.nextStackID = 0x2654; // ♔, ♕, ♖, ♗, ♘, ♙, ♠, ♡, ♢, ♣, ♤, ♥, ♦, ♧
            this.minStackPos = 0;
            this.reused = [];
            this.stoppedAt = null;
            this.lastBigReductionStart = -1;
            this.lastBigReductionSize = 0;
            this.bigReductionCount = 0;
            this.stream = new InputStream(input, ranges);
            this.tokens = new TokenCache(parser, this.stream);
            this.topTerm = parser.top[1];
            let { from } = ranges[0];
            this.stacks = [Stack.start(this, parser.top[0], from)];
            this.fragments = fragments.length && this.stream.end - from > parser.bufferLength * 4
                ? new FragmentCursor(fragments, parser.nodeSet) : null;
        }
        get parsedPos() {
            return this.minStackPos;
        }
        // Move the parser forward. This will process all parse stacks at
        // `this.pos` and try to advance them to a further position. If no
        // stack for such a position is found, it'll start error-recovery.
        //
        // When the parse is finished, this will return a syntax tree. When
        // not, it returns `null`.
        advance() {
            let stacks = this.stacks, pos = this.minStackPos;
            // This will hold stacks beyond `pos`.
            let newStacks = this.stacks = [];
            let stopped, stoppedTokens;
            // If a large amount of reductions happened with the same start
            // position, force the stack out of that production in order to
            // avoid creating a tree too deep to recurse through.
            // (This is an ugly kludge, because unfortunately there is no
            // straightforward, cheap way to check for this happening, due to
            // the history of reductions only being available in an
            // expensive-to-access format in the stack buffers.)
            if (this.bigReductionCount > 300 /* Rec.MaxLeftAssociativeReductionCount */ && stacks.length == 1) {
                let [s] = stacks;
                while (s.forceReduce() && s.stack.length && s.stack[s.stack.length - 2] >= this.lastBigReductionStart) { }
                this.bigReductionCount = this.lastBigReductionSize = 0;
            }
            // Keep advancing any stacks at `pos` until they either move
            // forward or can't be advanced. Gather stacks that can't be
            // advanced further in `stopped`.
            for (let i = 0; i < stacks.length; i++) {
                let stack = stacks[i];
                for (;;) {
                    this.tokens.mainToken = null;
                    if (stack.pos > pos) {
                        newStacks.push(stack);
                    }
                    else if (this.advanceStack(stack, newStacks, stacks)) {
                        continue;
                    }
                    else {
                        if (!stopped) {
                            stopped = [];
                            stoppedTokens = [];
                        }
                        stopped.push(stack);
                        let tok = this.tokens.getMainToken(stack);
                        stoppedTokens.push(tok.value, tok.end);
                    }
                    break;
                }
            }
            if (!newStacks.length) {
                let finished = stopped && findFinished(stopped);
                if (finished) {
                    if (verbose)
                        console.log("Finish with " + this.stackID(finished));
                    return this.stackToTree(finished);
                }
                if (this.parser.strict) {
                    if (verbose && stopped)
                        console.log("Stuck with token " + (this.tokens.mainToken ? this.parser.getName(this.tokens.mainToken.value) : "none"));
                    throw new SyntaxError("No parse at " + pos);
                }
                if (!this.recovering)
                    this.recovering = 5 /* Rec.Distance */;
            }
            if (this.recovering && stopped) {
                let finished = this.stoppedAt != null && stopped[0].pos > this.stoppedAt ? stopped[0]
                    : this.runRecovery(stopped, stoppedTokens, newStacks);
                if (finished) {
                    if (verbose)
                        console.log("Force-finish " + this.stackID(finished));
                    return this.stackToTree(finished.forceAll());
                }
            }
            if (this.recovering) {
                let maxRemaining = this.recovering == 1 ? 1 : this.recovering * 3 /* Rec.MaxRemainingPerStep */;
                if (newStacks.length > maxRemaining) {
                    newStacks.sort((a, b) => b.score - a.score);
                    while (newStacks.length > maxRemaining)
                        newStacks.pop();
                }
                if (newStacks.some(s => s.reducePos > pos))
                    this.recovering--;
            }
            else if (newStacks.length > 1) {
                // Prune stacks that are in the same state, or that have been
                // running without splitting for a while, to avoid getting stuck
                // with multiple successful stacks running endlessly on.
                outer: for (let i = 0; i < newStacks.length - 1; i++) {
                    let stack = newStacks[i];
                    for (let j = i + 1; j < newStacks.length; j++) {
                        let other = newStacks[j];
                        if (stack.sameState(other) ||
                            stack.buffer.length > 500 /* Rec.MinBufferLengthPrune */ && other.buffer.length > 500 /* Rec.MinBufferLengthPrune */) {
                            if (((stack.score - other.score) || (stack.buffer.length - other.buffer.length)) > 0) {
                                newStacks.splice(j--, 1);
                            }
                            else {
                                newStacks.splice(i--, 1);
                                continue outer;
                            }
                        }
                    }
                }
                if (newStacks.length > 12 /* Rec.MaxStackCount */)
                    newStacks.splice(12 /* Rec.MaxStackCount */, newStacks.length - 12 /* Rec.MaxStackCount */);
            }
            this.minStackPos = newStacks[0].pos;
            for (let i = 1; i < newStacks.length; i++)
                if (newStacks[i].pos < this.minStackPos)
                    this.minStackPos = newStacks[i].pos;
            return null;
        }
        stopAt(pos) {
            if (this.stoppedAt != null && this.stoppedAt < pos)
                throw new RangeError("Can't move stoppedAt forward");
            this.stoppedAt = pos;
        }
        // Returns an updated version of the given stack, or null if the
        // stack can't advance normally. When `split` and `stacks` are
        // given, stacks split off by ambiguous operations will be pushed to
        // `split`, or added to `stacks` if they move `pos` forward.
        advanceStack(stack, stacks, split) {
            let start = stack.pos, { parser } = this;
            let base = verbose ? this.stackID(stack) + " -> " : "";
            if (this.stoppedAt != null && start > this.stoppedAt)
                return stack.forceReduce() ? stack : null;
            if (this.fragments) {
                let strictCx = stack.curContext && stack.curContext.tracker.strict, cxHash = strictCx ? stack.curContext.hash : 0;
                for (let cached = this.fragments.nodeAt(start); cached;) {
                    let match = this.parser.nodeSet.types[cached.type.id] == cached.type ? parser.getGoto(stack.state, cached.type.id) : -1;
                    if (match > -1 && cached.length && (!strictCx || (cached.prop(NodeProp.contextHash) || 0) == cxHash)) {
                        stack.useNode(cached, match);
                        if (verbose)
                            console.log(base + this.stackID(stack) + ` (via reuse of ${parser.getName(cached.type.id)})`);
                        return true;
                    }
                    if (!(cached instanceof Tree) || cached.children.length == 0 || cached.positions[0] > 0)
                        break;
                    let inner = cached.children[0];
                    if (inner instanceof Tree && cached.positions[0] == 0)
                        cached = inner;
                    else
                        break;
                }
            }
            let defaultReduce = parser.stateSlot(stack.state, 4 /* ParseState.DefaultReduce */);
            if (defaultReduce > 0) {
                stack.reduce(defaultReduce);
                if (verbose)
                    console.log(base + this.stackID(stack) + ` (via always-reduce ${parser.getName(defaultReduce & 65535 /* Action.ValueMask */)})`);
                return true;
            }
            if (stack.stack.length >= 8400 /* Rec.CutDepth */) {
                while (stack.stack.length > 6000 /* Rec.CutTo */ && stack.forceReduce()) { }
            }
            let actions = this.tokens.getActions(stack);
            for (let i = 0; i < actions.length;) {
                let action = actions[i++], term = actions[i++], end = actions[i++];
                let last = i == actions.length || !split;
                let localStack = last ? stack : stack.split();
                let main = this.tokens.mainToken;
                localStack.apply(action, term, main ? main.start : localStack.pos, end);
                if (verbose)
                    console.log(base + this.stackID(localStack) + ` (via ${(action & 65536 /* Action.ReduceFlag */) == 0 ? "shift"
                    : `reduce of ${parser.getName(action & 65535 /* Action.ValueMask */)}`} for ${parser.getName(term)} @ ${start}${localStack == stack ? "" : ", split"})`);
                if (last)
                    return true;
                else if (localStack.pos > start)
                    stacks.push(localStack);
                else
                    split.push(localStack);
            }
            return false;
        }
        // Advance a given stack forward as far as it will go. Returns the
        // (possibly updated) stack if it got stuck, or null if it moved
        // forward and was given to `pushStackDedup`.
        advanceFully(stack, newStacks) {
            let pos = stack.pos;
            for (;;) {
                if (!this.advanceStack(stack, null, null))
                    return false;
                if (stack.pos > pos) {
                    pushStackDedup(stack, newStacks);
                    return true;
                }
            }
        }
        runRecovery(stacks, tokens, newStacks) {
            let finished = null, restarted = false;
            for (let i = 0; i < stacks.length; i++) {
                let stack = stacks[i], token = tokens[i << 1], tokenEnd = tokens[(i << 1) + 1];
                let base = verbose ? this.stackID(stack) + " -> " : "";
                if (stack.deadEnd) {
                    if (restarted)
                        continue;
                    restarted = true;
                    stack.restart();
                    if (verbose)
                        console.log(base + this.stackID(stack) + " (restarted)");
                    let done = this.advanceFully(stack, newStacks);
                    if (done)
                        continue;
                }
                let force = stack.split(), forceBase = base;
                for (let j = 0; force.forceReduce() && j < 10 /* Rec.ForceReduceLimit */; j++) {
                    if (verbose)
                        console.log(forceBase + this.stackID(force) + " (via force-reduce)");
                    let done = this.advanceFully(force, newStacks);
                    if (done)
                        break;
                    if (verbose)
                        forceBase = this.stackID(force) + " -> ";
                }
                for (let insert of stack.recoverByInsert(token)) {
                    if (verbose)
                        console.log(base + this.stackID(insert) + " (via recover-insert)");
                    this.advanceFully(insert, newStacks);
                }
                if (this.stream.end > stack.pos) {
                    if (tokenEnd == stack.pos) {
                        tokenEnd++;
                        token = 0 /* Term.Err */;
                    }
                    stack.recoverByDelete(token, tokenEnd);
                    if (verbose)
                        console.log(base + this.stackID(stack) + ` (via recover-delete ${this.parser.getName(token)})`);
                    pushStackDedup(stack, newStacks);
                }
                else if (!finished || finished.score < stack.score) {
                    finished = stack;
                }
            }
            return finished;
        }
        // Convert the stack's buffer to a syntax tree.
        stackToTree(stack) {
            stack.close();
            return Tree.build({ buffer: StackBufferCursor.create(stack),
                nodeSet: this.parser.nodeSet,
                topID: this.topTerm,
                maxBufferLength: this.parser.bufferLength,
                reused: this.reused,
                start: this.ranges[0].from,
                length: stack.pos - this.ranges[0].from,
                minRepeatType: this.parser.minRepeatTerm });
        }
        stackID(stack) {
            let id = (stackIDs || (stackIDs = new WeakMap)).get(stack);
            if (!id)
                stackIDs.set(stack, id = String.fromCodePoint(this.nextStackID++));
            return id + stack;
        }
    }
    function pushStackDedup(stack, newStacks) {
        for (let i = 0; i < newStacks.length; i++) {
            let other = newStacks[i];
            if (other.pos == stack.pos && other.sameState(stack)) {
                if (newStacks[i].score < stack.score)
                    newStacks[i] = stack;
                return;
            }
        }
        newStacks.push(stack);
    }
    class Dialect {
        constructor(source, flags, disabled) {
            this.source = source;
            this.flags = flags;
            this.disabled = disabled;
        }
        allows(term) { return !this.disabled || this.disabled[term] == 0; }
    }
    const id = x => x;
    /**
    Context trackers are used to track stateful context (such as
    indentation in the Python grammar, or parent elements in the XML
    grammar) needed by external tokenizers. You declare them in a
    grammar file as `@context exportName from "module"`.

    Context values should be immutable, and can be updated (replaced)
    on shift or reduce actions.

    The export used in a `@context` declaration should be of this
    type.
    */
    class ContextTracker {
        /**
        Define a context tracker.
        */
        constructor(spec) {
            this.start = spec.start;
            this.shift = spec.shift || id;
            this.reduce = spec.reduce || id;
            this.reuse = spec.reuse || id;
            this.hash = spec.hash || (() => 0);
            this.strict = spec.strict !== false;
        }
    }
    /**
    Holds the parse tables for a given grammar, as generated by
    `lezer-generator`, and provides [methods](#common.Parser) to parse
    content with.
    */
    class LRParser extends Parser {
        /**
        @internal
        */
        constructor(spec) {
            super();
            /**
            @internal
            */
            this.wrappers = [];
            if (spec.version != 14 /* File.Version */)
                throw new RangeError(`Parser version (${spec.version}) doesn't match runtime version (${14 /* File.Version */})`);
            let nodeNames = spec.nodeNames.split(" ");
            this.minRepeatTerm = nodeNames.length;
            for (let i = 0; i < spec.repeatNodeCount; i++)
                nodeNames.push("");
            let topTerms = Object.keys(spec.topRules).map(r => spec.topRules[r][1]);
            let nodeProps = [];
            for (let i = 0; i < nodeNames.length; i++)
                nodeProps.push([]);
            function setProp(nodeID, prop, value) {
                nodeProps[nodeID].push([prop, prop.deserialize(String(value))]);
            }
            if (spec.nodeProps)
                for (let propSpec of spec.nodeProps) {
                    let prop = propSpec[0];
                    if (typeof prop == "string")
                        prop = NodeProp[prop];
                    for (let i = 1; i < propSpec.length;) {
                        let next = propSpec[i++];
                        if (next >= 0) {
                            setProp(next, prop, propSpec[i++]);
                        }
                        else {
                            let value = propSpec[i + -next];
                            for (let j = -next; j > 0; j--)
                                setProp(propSpec[i++], prop, value);
                            i++;
                        }
                    }
                }
            this.nodeSet = new NodeSet(nodeNames.map((name, i) => NodeType.define({
                name: i >= this.minRepeatTerm ? undefined : name,
                id: i,
                props: nodeProps[i],
                top: topTerms.indexOf(i) > -1,
                error: i == 0,
                skipped: spec.skippedNodes && spec.skippedNodes.indexOf(i) > -1
            })));
            if (spec.propSources)
                this.nodeSet = this.nodeSet.extend(...spec.propSources);
            this.strict = false;
            this.bufferLength = DefaultBufferLength;
            let tokenArray = decodeArray(spec.tokenData);
            this.context = spec.context;
            this.specializerSpecs = spec.specialized || [];
            this.specialized = new Uint16Array(this.specializerSpecs.length);
            for (let i = 0; i < this.specializerSpecs.length; i++)
                this.specialized[i] = this.specializerSpecs[i].term;
            this.specializers = this.specializerSpecs.map(getSpecializer);
            this.states = decodeArray(spec.states, Uint32Array);
            this.data = decodeArray(spec.stateData);
            this.goto = decodeArray(spec.goto);
            this.maxTerm = spec.maxTerm;
            this.tokenizers = spec.tokenizers.map(value => typeof value == "number" ? new TokenGroup(tokenArray, value) : value);
            this.topRules = spec.topRules;
            this.dialects = spec.dialects || {};
            this.dynamicPrecedences = spec.dynamicPrecedences || null;
            this.tokenPrecTable = spec.tokenPrec;
            this.termNames = spec.termNames || null;
            this.maxNode = this.nodeSet.types.length - 1;
            this.dialect = this.parseDialect();
            this.top = this.topRules[Object.keys(this.topRules)[0]];
        }
        createParse(input, fragments, ranges) {
            let parse = new Parse(this, input, fragments, ranges);
            for (let w of this.wrappers)
                parse = w(parse, input, fragments, ranges);
            return parse;
        }
        /**
        Get a goto table entry @internal
        */
        getGoto(state, term, loose = false) {
            let table = this.goto;
            if (term >= table[0])
                return -1;
            for (let pos = table[term + 1];;) {
                let groupTag = table[pos++], last = groupTag & 1;
                let target = table[pos++];
                if (last && loose)
                    return target;
                for (let end = pos + (groupTag >> 1); pos < end; pos++)
                    if (table[pos] == state)
                        return target;
                if (last)
                    return -1;
            }
        }
        /**
        Check if this state has an action for a given terminal @internal
        */
        hasAction(state, terminal) {
            let data = this.data;
            for (let set = 0; set < 2; set++) {
                for (let i = this.stateSlot(state, set ? 2 /* ParseState.Skip */ : 1 /* ParseState.Actions */), next;; i += 3) {
                    if ((next = data[i]) == 65535 /* Seq.End */) {
                        if (data[i + 1] == 1 /* Seq.Next */)
                            next = data[i = pair(data, i + 2)];
                        else if (data[i + 1] == 2 /* Seq.Other */)
                            return pair(data, i + 2);
                        else
                            break;
                    }
                    if (next == terminal || next == 0 /* Term.Err */)
                        return pair(data, i + 1);
                }
            }
            return 0;
        }
        /**
        @internal
        */
        stateSlot(state, slot) {
            return this.states[(state * 6 /* ParseState.Size */) + slot];
        }
        /**
        @internal
        */
        stateFlag(state, flag) {
            return (this.stateSlot(state, 0 /* ParseState.Flags */) & flag) > 0;
        }
        /**
        @internal
        */
        validAction(state, action) {
            return !!this.allActions(state, a => a == action ? true : null);
        }
        /**
        @internal
        */
        allActions(state, action) {
            let deflt = this.stateSlot(state, 4 /* ParseState.DefaultReduce */);
            let result = deflt ? action(deflt) : undefined;
            for (let i = this.stateSlot(state, 1 /* ParseState.Actions */); result == null; i += 3) {
                if (this.data[i] == 65535 /* Seq.End */) {
                    if (this.data[i + 1] == 1 /* Seq.Next */)
                        i = pair(this.data, i + 2);
                    else
                        break;
                }
                result = action(pair(this.data, i + 1));
            }
            return result;
        }
        /**
        Get the states that can follow this one through shift actions or
        goto jumps. @internal
        */
        nextStates(state) {
            let result = [];
            for (let i = this.stateSlot(state, 1 /* ParseState.Actions */);; i += 3) {
                if (this.data[i] == 65535 /* Seq.End */) {
                    if (this.data[i + 1] == 1 /* Seq.Next */)
                        i = pair(this.data, i + 2);
                    else
                        break;
                }
                if ((this.data[i + 2] & (65536 /* Action.ReduceFlag */ >> 16)) == 0) {
                    let value = this.data[i + 1];
                    if (!result.some((v, i) => (i & 1) && v == value))
                        result.push(this.data[i], value);
                }
            }
            return result;
        }
        /**
        Configure the parser. Returns a new parser instance that has the
        given settings modified. Settings not provided in `config` are
        kept from the original parser.
        */
        configure(config) {
            // Hideous reflection-based kludge to make it easy to create a
            // slightly modified copy of a parser.
            let copy = Object.assign(Object.create(LRParser.prototype), this);
            if (config.props)
                copy.nodeSet = this.nodeSet.extend(...config.props);
            if (config.top) {
                let info = this.topRules[config.top];
                if (!info)
                    throw new RangeError(`Invalid top rule name ${config.top}`);
                copy.top = info;
            }
            if (config.tokenizers)
                copy.tokenizers = this.tokenizers.map(t => {
                    let found = config.tokenizers.find(r => r.from == t);
                    return found ? found.to : t;
                });
            if (config.specializers) {
                copy.specializers = this.specializers.slice();
                copy.specializerSpecs = this.specializerSpecs.map((s, i) => {
                    let found = config.specializers.find(r => r.from == s.external);
                    if (!found)
                        return s;
                    let spec = Object.assign(Object.assign({}, s), { external: found.to });
                    copy.specializers[i] = getSpecializer(spec);
                    return spec;
                });
            }
            if (config.contextTracker)
                copy.context = config.contextTracker;
            if (config.dialect)
                copy.dialect = this.parseDialect(config.dialect);
            if (config.strict != null)
                copy.strict = config.strict;
            if (config.wrap)
                copy.wrappers = copy.wrappers.concat(config.wrap);
            if (config.bufferLength != null)
                copy.bufferLength = config.bufferLength;
            return copy;
        }
        /**
        Tells you whether any [parse wrappers](#lr.ParserConfig.wrap)
        are registered for this parser.
        */
        hasWrappers() {
            return this.wrappers.length > 0;
        }
        /**
        Returns the name associated with a given term. This will only
        work for all terms when the parser was generated with the
        `--names` option. By default, only the names of tagged terms are
        stored.
        */
        getName(term) {
            return this.termNames ? this.termNames[term] : String(term <= this.maxNode && this.nodeSet.types[term].name || term);
        }
        /**
        The eof term id is always allocated directly after the node
        types. @internal
        */
        get eofTerm() { return this.maxNode + 1; }
        /**
        The type of top node produced by the parser.
        */
        get topNode() { return this.nodeSet.types[this.top[1]]; }
        /**
        @internal
        */
        dynamicPrecedence(term) {
            let prec = this.dynamicPrecedences;
            return prec == null ? 0 : prec[term] || 0;
        }
        /**
        @internal
        */
        parseDialect(dialect) {
            let values = Object.keys(this.dialects), flags = values.map(() => false);
            if (dialect)
                for (let part of dialect.split(" ")) {
                    let id = values.indexOf(part);
                    if (id >= 0)
                        flags[id] = true;
                }
            let disabled = null;
            for (let i = 0; i < values.length; i++)
                if (!flags[i]) {
                    for (let j = this.dialects[values[i]], id; (id = this.data[j++]) != 65535 /* Seq.End */;)
                        (disabled || (disabled = new Uint8Array(this.maxTerm + 1)))[id] = 1;
                }
            return new Dialect(dialect, flags, disabled);
        }
        /**
        Used by the output of the parser generator. Not available to
        user code. @hide
        */
        static deserialize(spec) {
            return new LRParser(spec);
        }
    }
    function pair(data, off) { return data[off] | (data[off + 1] << 16); }
    function findFinished(stacks) {
        let best = null;
        for (let stack of stacks) {
            let stopped = stack.p.stoppedAt;
            if ((stack.pos == stack.p.stream.end || stopped != null && stack.pos > stopped) &&
                stack.p.parser.stateFlag(stack.state, 2 /* StateFlag.Accepting */) &&
                (!best || best.score < stack.score))
                best = stack;
        }
        return best;
    }
    function getSpecializer(spec) {
        if (spec.external) {
            let mask = spec.extend ? 1 /* Specialize.Extend */ : 0 /* Specialize.Specialize */;
            return (value, stack) => (spec.external(value, stack) << 1) | mask;
        }
        return spec.get;
    }

    // This file was generated by lezer-generator. You probably shouldn't edit it.
    const noSemi = 315,
      noSemiType = 316,
      incdec = 1,
      incdecPrefix = 2,
      questionDot = 3,
      JSXStartTag = 4,
      insertSemi = 317,
      spaces = 319,
      newline = 320,
      LineComment = 5,
      BlockComment = 6,
      Dialect_jsx = 0;

    /* Hand-written tokenizers for JavaScript tokens that can't be
       expressed by lezer's built-in tokenizer. */

    const space = [9, 10, 11, 12, 13, 32, 133, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200,
                   8201, 8202, 8232, 8233, 8239, 8287, 12288];

    const braceR = 125, semicolon = 59, slash = 47, star = 42, plus = 43, minus = 45, lt = 60, comma = 44,
          question = 63, dot = 46, bracketL = 91;

    const trackNewline = new ContextTracker({
      start: false,
      shift(context, term) {
        return term == LineComment || term == BlockComment || term == spaces ? context : term == newline
      },
      strict: false
    });

    const insertSemicolon = new ExternalTokenizer((input, stack) => {
      let {next} = input;
      if (next == braceR || next == -1 || stack.context)
        input.acceptToken(insertSemi);
    }, {contextual: true, fallback: true});

    const noSemicolon = new ExternalTokenizer((input, stack) => {
      let {next} = input, after;
      if (space.indexOf(next) > -1) return
      if (next == slash && ((after = input.peek(1)) == slash || after == star)) return
      if (next != braceR && next != semicolon && next != -1 && !stack.context)
        input.acceptToken(noSemi);
    }, {contextual: true});

    const noSemicolonType = new ExternalTokenizer((input, stack) => {
      if (input.next == bracketL && !stack.context) input.acceptToken(noSemiType);
    }, {contextual: true});

    const operatorToken = new ExternalTokenizer((input, stack) => {
      let {next} = input;
      if (next == plus || next == minus) {
        input.advance();
        if (next == input.next) {
          input.advance();
          let mayPostfix = !stack.context && stack.canShift(incdec);
          input.acceptToken(mayPostfix ? incdec : incdecPrefix);
        }
      } else if (next == question && input.peek(1) == dot) {
        input.advance(); input.advance();
        if (input.next < 48 || input.next > 57) // No digit after
          input.acceptToken(questionDot);
      }
    }, {contextual: true});

    function identifierChar(ch, start) {
      return ch >= 65 && ch <= 90 || ch >= 97 && ch <= 122 || ch == 95 || ch >= 192 ||
        !start && ch >= 48 && ch <= 57
    }

    const jsx = new ExternalTokenizer((input, stack) => {
      if (input.next != lt || !stack.dialectEnabled(Dialect_jsx)) return
      input.advance();
      if (input.next == slash) return
      // Scan for an identifier followed by a comma or 'extends', don't
      // treat this as a start tag if present.
      let back = 0;
      while (space.indexOf(input.next) > -1) { input.advance(); back++; }
      if (identifierChar(input.next, true)) {
        input.advance();
        back++;
        while (identifierChar(input.next, false)) { input.advance(); back++; }
        while (space.indexOf(input.next) > -1) { input.advance(); back++; }
        if (input.next == comma) return
        for (let i = 0;; i++) {
          if (i == 7) {
            if (!identifierChar(input.next, true)) return
            break
          }
          if (input.next != "extends".charCodeAt(i)) break
          input.advance();
          back++;
        }
      }
      input.acceptToken(JSXStartTag, -back);
    });

    let nextTagID = 0;
    /**
    Highlighting tags are markers that denote a highlighting category.
    They are [associated](#highlight.styleTags) with parts of a syntax
    tree by a language mode, and then mapped to an actual CSS style by
    a [highlighter](#highlight.Highlighter).

    Because syntax tree node types and highlight styles have to be
    able to talk the same language, CodeMirror uses a mostly _closed_
    [vocabulary](#highlight.tags) of syntax tags (as opposed to
    traditional open string-based systems, which make it hard for
    highlighting themes to cover all the tokens produced by the
    various languages).

    It _is_ possible to [define](#highlight.Tag^define) your own
    highlighting tags for system-internal use (where you control both
    the language package and the highlighter), but such tags will not
    be picked up by regular highlighters (though you can derive them
    from standard tags to allow highlighters to fall back to those).
    */
    class Tag {
        /**
        @internal
        */
        constructor(
        /**
        The optional name of the base tag @internal
        */
        name,
        /**
        The set of this tag and all its parent tags, starting with
        this one itself and sorted in order of decreasing specificity.
        */
        set,
        /**
        The base unmodified tag that this one is based on, if it's
        modified @internal
        */
        base,
        /**
        The modifiers applied to this.base @internal
        */
        modified) {
            this.name = name;
            this.set = set;
            this.base = base;
            this.modified = modified;
            /**
            @internal
            */
            this.id = nextTagID++;
        }
        toString() {
            let { name } = this;
            for (let mod of this.modified)
                if (mod.name)
                    name = `${mod.name}(${name})`;
            return name;
        }
        static define(nameOrParent, parent) {
            let name = typeof nameOrParent == "string" ? nameOrParent : "?";
            if (nameOrParent instanceof Tag)
                parent = nameOrParent;
            if (parent === null || parent === void 0 ? void 0 : parent.base)
                throw new Error("Can not derive from a modified tag");
            let tag = new Tag(name, [], null, []);
            tag.set.push(tag);
            if (parent)
                for (let t of parent.set)
                    tag.set.push(t);
            return tag;
        }
        /**
        Define a tag _modifier_, which is a function that, given a tag,
        will return a tag that is a subtag of the original. Applying the
        same modifier to a twice tag will return the same value (`m1(t1)
        == m1(t1)`) and applying multiple modifiers will, regardless or
        order, produce the same tag (`m1(m2(t1)) == m2(m1(t1))`).

        When multiple modifiers are applied to a given base tag, each
        smaller set of modifiers is registered as a parent, so that for
        example `m1(m2(m3(t1)))` is a subtype of `m1(m2(t1))`,
        `m1(m3(t1)`, and so on.
        */
        static defineModifier(name) {
            let mod = new Modifier(name);
            return (tag) => {
                if (tag.modified.indexOf(mod) > -1)
                    return tag;
                return Modifier.get(tag.base || tag, tag.modified.concat(mod).sort((a, b) => a.id - b.id));
            };
        }
    }
    let nextModifierID = 0;
    class Modifier {
        constructor(name) {
            this.name = name;
            this.instances = [];
            this.id = nextModifierID++;
        }
        static get(base, mods) {
            if (!mods.length)
                return base;
            let exists = mods[0].instances.find(t => t.base == base && sameArray(mods, t.modified));
            if (exists)
                return exists;
            let set = [], tag = new Tag(base.name, set, base, mods);
            for (let m of mods)
                m.instances.push(tag);
            let configs = powerSet(mods);
            for (let parent of base.set)
                if (!parent.modified.length)
                    for (let config of configs)
                        set.push(Modifier.get(parent, config));
            return tag;
        }
    }
    function sameArray(a, b) {
        return a.length == b.length && a.every((x, i) => x == b[i]);
    }
    function powerSet(array) {
        let sets = [[]];
        for (let i = 0; i < array.length; i++) {
            for (let j = 0, e = sets.length; j < e; j++) {
                sets.push(sets[j].concat(array[i]));
            }
        }
        return sets.sort((a, b) => b.length - a.length);
    }
    /**
    This function is used to add a set of tags to a language syntax
    via [`NodeSet.extend`](#common.NodeSet.extend) or
    [`LRParser.configure`](#lr.LRParser.configure).

    The argument object maps node selectors to [highlighting
    tags](#highlight.Tag) or arrays of tags.

    Node selectors may hold one or more (space-separated) node paths.
    Such a path can be a [node name](#common.NodeType.name), or
    multiple node names (or `*` wildcards) separated by slash
    characters, as in `"Block/Declaration/VariableName"`. Such a path
    matches the final node but only if its direct parent nodes are the
    other nodes mentioned. A `*` in such a path matches any parent,
    but only a single level—wildcards that match multiple parents
    aren't supported, both for efficiency reasons and because Lezer
    trees make it rather hard to reason about what they would match.)

    A path can be ended with `/...` to indicate that the tag assigned
    to the node should also apply to all child nodes, even if they
    match their own style (by default, only the innermost style is
    used).

    When a path ends in `!`, as in `Attribute!`, no further matching
    happens for the node's child nodes, and the entire node gets the
    given style.

    In this notation, node names that contain `/`, `!`, `*`, or `...`
    must be quoted as JSON strings.

    For example:

    ```javascript
    parser.withProps(
      styleTags({
        // Style Number and BigNumber nodes
        "Number BigNumber": tags.number,
        // Style Escape nodes whose parent is String
        "String/Escape": tags.escape,
        // Style anything inside Attributes nodes
        "Attributes!": tags.meta,
        // Add a style to all content inside Italic nodes
        "Italic/...": tags.emphasis,
        // Style InvalidString nodes as both `string` and `invalid`
        "InvalidString": [tags.string, tags.invalid],
        // Style the node named "/" as punctuation
        '"/"': tags.punctuation
      })
    )
    ```
    */
    function styleTags(spec) {
        let byName = Object.create(null);
        for (let prop in spec) {
            let tags = spec[prop];
            if (!Array.isArray(tags))
                tags = [tags];
            for (let part of prop.split(" "))
                if (part) {
                    let pieces = [], mode = 2 /* Mode.Normal */, rest = part;
                    for (let pos = 0;;) {
                        if (rest == "..." && pos > 0 && pos + 3 == part.length) {
                            mode = 1 /* Mode.Inherit */;
                            break;
                        }
                        let m = /^"(?:[^"\\]|\\.)*?"|[^\/!]+/.exec(rest);
                        if (!m)
                            throw new RangeError("Invalid path: " + part);
                        pieces.push(m[0] == "*" ? "" : m[0][0] == '"' ? JSON.parse(m[0]) : m[0]);
                        pos += m[0].length;
                        if (pos == part.length)
                            break;
                        let next = part[pos++];
                        if (pos == part.length && next == "!") {
                            mode = 0 /* Mode.Opaque */;
                            break;
                        }
                        if (next != "/")
                            throw new RangeError("Invalid path: " + part);
                        rest = part.slice(pos);
                    }
                    let last = pieces.length - 1, inner = pieces[last];
                    if (!inner)
                        throw new RangeError("Invalid path: " + part);
                    let rule = new Rule(tags, mode, last > 0 ? pieces.slice(0, last) : null);
                    byName[inner] = rule.sort(byName[inner]);
                }
        }
        return ruleNodeProp.add(byName);
    }
    const ruleNodeProp = new NodeProp();
    class Rule {
        constructor(tags, mode, context, next) {
            this.tags = tags;
            this.mode = mode;
            this.context = context;
            this.next = next;
        }
        get opaque() { return this.mode == 0 /* Mode.Opaque */; }
        get inherit() { return this.mode == 1 /* Mode.Inherit */; }
        sort(other) {
            if (!other || other.depth < this.depth) {
                this.next = other;
                return this;
            }
            other.next = this.sort(other.next);
            return other;
        }
        get depth() { return this.context ? this.context.length : 0; }
    }
    Rule.empty = new Rule([], 2 /* Mode.Normal */, null);
    /**
    Define a [highlighter](#highlight.Highlighter) from an array of
    tag/class pairs. Classes associated with more specific tags will
    take precedence.
    */
    function tagHighlighter(tags, options) {
        let map = Object.create(null);
        for (let style of tags) {
            if (!Array.isArray(style.tag))
                map[style.tag.id] = style.class;
            else
                for (let tag of style.tag)
                    map[tag.id] = style.class;
        }
        let { scope, all = null } = options || {};
        return {
            style: (tags) => {
                let cls = all;
                for (let tag of tags) {
                    for (let sub of tag.set) {
                        let tagClass = map[sub.id];
                        if (tagClass) {
                            cls = cls ? cls + " " + tagClass : tagClass;
                            break;
                        }
                    }
                }
                return cls;
            },
            scope
        };
    }
    const t = Tag.define;
    const comment = t(), name = t(), typeName = t(name), propertyName = t(name), literal = t(), string = t(literal), number = t(literal), content = t(), heading = t(content), keyword = t(), operator = t(), punctuation = t(), bracket = t(punctuation), meta = t();
    /**
    The default set of highlighting [tags](#highlight.Tag).

    This collection is heavily biased towards programming languages,
    and necessarily incomplete. A full ontology of syntactic
    constructs would fill a stack of books, and be impractical to
    write themes for. So try to make do with this set. If all else
    fails, [open an
    issue](https://github.com/codemirror/codemirror.next) to propose a
    new tag, or [define](#highlight.Tag^define) a local custom tag for
    your use case.

    Note that it is not obligatory to always attach the most specific
    tag possible to an element—if your grammar can't easily
    distinguish a certain type of element (such as a local variable),
    it is okay to style it as its more general variant (a variable).

    For tags that extend some parent tag, the documentation links to
    the parent.
    */
    const tags = {
        /**
        A comment.
        */
        comment,
        /**
        A line [comment](#highlight.tags.comment).
        */
        lineComment: t(comment),
        /**
        A block [comment](#highlight.tags.comment).
        */
        blockComment: t(comment),
        /**
        A documentation [comment](#highlight.tags.comment).
        */
        docComment: t(comment),
        /**
        Any kind of identifier.
        */
        name,
        /**
        The [name](#highlight.tags.name) of a variable.
        */
        variableName: t(name),
        /**
        A type [name](#highlight.tags.name).
        */
        typeName: typeName,
        /**
        A tag name (subtag of [`typeName`](#highlight.tags.typeName)).
        */
        tagName: t(typeName),
        /**
        A property or field [name](#highlight.tags.name).
        */
        propertyName: propertyName,
        /**
        An attribute name (subtag of [`propertyName`](#highlight.tags.propertyName)).
        */
        attributeName: t(propertyName),
        /**
        The [name](#highlight.tags.name) of a class.
        */
        className: t(name),
        /**
        A label [name](#highlight.tags.name).
        */
        labelName: t(name),
        /**
        A namespace [name](#highlight.tags.name).
        */
        namespace: t(name),
        /**
        The [name](#highlight.tags.name) of a macro.
        */
        macroName: t(name),
        /**
        A literal value.
        */
        literal,
        /**
        A string [literal](#highlight.tags.literal).
        */
        string,
        /**
        A documentation [string](#highlight.tags.string).
        */
        docString: t(string),
        /**
        A character literal (subtag of [string](#highlight.tags.string)).
        */
        character: t(string),
        /**
        An attribute value (subtag of [string](#highlight.tags.string)).
        */
        attributeValue: t(string),
        /**
        A number [literal](#highlight.tags.literal).
        */
        number,
        /**
        An integer [number](#highlight.tags.number) literal.
        */
        integer: t(number),
        /**
        A floating-point [number](#highlight.tags.number) literal.
        */
        float: t(number),
        /**
        A boolean [literal](#highlight.tags.literal).
        */
        bool: t(literal),
        /**
        Regular expression [literal](#highlight.tags.literal).
        */
        regexp: t(literal),
        /**
        An escape [literal](#highlight.tags.literal), for example a
        backslash escape in a string.
        */
        escape: t(literal),
        /**
        A color [literal](#highlight.tags.literal).
        */
        color: t(literal),
        /**
        A URL [literal](#highlight.tags.literal).
        */
        url: t(literal),
        /**
        A language keyword.
        */
        keyword,
        /**
        The [keyword](#highlight.tags.keyword) for the self or this
        object.
        */
        self: t(keyword),
        /**
        The [keyword](#highlight.tags.keyword) for null.
        */
        null: t(keyword),
        /**
        A [keyword](#highlight.tags.keyword) denoting some atomic value.
        */
        atom: t(keyword),
        /**
        A [keyword](#highlight.tags.keyword) that represents a unit.
        */
        unit: t(keyword),
        /**
        A modifier [keyword](#highlight.tags.keyword).
        */
        modifier: t(keyword),
        /**
        A [keyword](#highlight.tags.keyword) that acts as an operator.
        */
        operatorKeyword: t(keyword),
        /**
        A control-flow related [keyword](#highlight.tags.keyword).
        */
        controlKeyword: t(keyword),
        /**
        A [keyword](#highlight.tags.keyword) that defines something.
        */
        definitionKeyword: t(keyword),
        /**
        A [keyword](#highlight.tags.keyword) related to defining or
        interfacing with modules.
        */
        moduleKeyword: t(keyword),
        /**
        An operator.
        */
        operator,
        /**
        An [operator](#highlight.tags.operator) that dereferences something.
        */
        derefOperator: t(operator),
        /**
        Arithmetic-related [operator](#highlight.tags.operator).
        */
        arithmeticOperator: t(operator),
        /**
        Logical [operator](#highlight.tags.operator).
        */
        logicOperator: t(operator),
        /**
        Bit [operator](#highlight.tags.operator).
        */
        bitwiseOperator: t(operator),
        /**
        Comparison [operator](#highlight.tags.operator).
        */
        compareOperator: t(operator),
        /**
        [Operator](#highlight.tags.operator) that updates its operand.
        */
        updateOperator: t(operator),
        /**
        [Operator](#highlight.tags.operator) that defines something.
        */
        definitionOperator: t(operator),
        /**
        Type-related [operator](#highlight.tags.operator).
        */
        typeOperator: t(operator),
        /**
        Control-flow [operator](#highlight.tags.operator).
        */
        controlOperator: t(operator),
        /**
        Program or markup punctuation.
        */
        punctuation,
        /**
        [Punctuation](#highlight.tags.punctuation) that separates
        things.
        */
        separator: t(punctuation),
        /**
        Bracket-style [punctuation](#highlight.tags.punctuation).
        */
        bracket,
        /**
        Angle [brackets](#highlight.tags.bracket) (usually `<` and `>`
        tokens).
        */
        angleBracket: t(bracket),
        /**
        Square [brackets](#highlight.tags.bracket) (usually `[` and `]`
        tokens).
        */
        squareBracket: t(bracket),
        /**
        Parentheses (usually `(` and `)` tokens). Subtag of
        [bracket](#highlight.tags.bracket).
        */
        paren: t(bracket),
        /**
        Braces (usually `{` and `}` tokens). Subtag of
        [bracket](#highlight.tags.bracket).
        */
        brace: t(bracket),
        /**
        Content, for example plain text in XML or markup documents.
        */
        content,
        /**
        [Content](#highlight.tags.content) that represents a heading.
        */
        heading,
        /**
        A level 1 [heading](#highlight.tags.heading).
        */
        heading1: t(heading),
        /**
        A level 2 [heading](#highlight.tags.heading).
        */
        heading2: t(heading),
        /**
        A level 3 [heading](#highlight.tags.heading).
        */
        heading3: t(heading),
        /**
        A level 4 [heading](#highlight.tags.heading).
        */
        heading4: t(heading),
        /**
        A level 5 [heading](#highlight.tags.heading).
        */
        heading5: t(heading),
        /**
        A level 6 [heading](#highlight.tags.heading).
        */
        heading6: t(heading),
        /**
        A prose [content](#highlight.tags.content) separator (such as a horizontal rule).
        */
        contentSeparator: t(content),
        /**
        [Content](#highlight.tags.content) that represents a list.
        */
        list: t(content),
        /**
        [Content](#highlight.tags.content) that represents a quote.
        */
        quote: t(content),
        /**
        [Content](#highlight.tags.content) that is emphasized.
        */
        emphasis: t(content),
        /**
        [Content](#highlight.tags.content) that is styled strong.
        */
        strong: t(content),
        /**
        [Content](#highlight.tags.content) that is part of a link.
        */
        link: t(content),
        /**
        [Content](#highlight.tags.content) that is styled as code or
        monospace.
        */
        monospace: t(content),
        /**
        [Content](#highlight.tags.content) that has a strike-through
        style.
        */
        strikethrough: t(content),
        /**
        Inserted text in a change-tracking format.
        */
        inserted: t(),
        /**
        Deleted text.
        */
        deleted: t(),
        /**
        Changed text.
        */
        changed: t(),
        /**
        An invalid or unsyntactic element.
        */
        invalid: t(),
        /**
        Metadata or meta-instruction.
        */
        meta,
        /**
        [Metadata](#highlight.tags.meta) that applies to the entire
        document.
        */
        documentMeta: t(meta),
        /**
        [Metadata](#highlight.tags.meta) that annotates or adds
        attributes to a given syntactic element.
        */
        annotation: t(meta),
        /**
        Processing instruction or preprocessor directive. Subtag of
        [meta](#highlight.tags.meta).
        */
        processingInstruction: t(meta),
        /**
        [Modifier](#highlight.Tag^defineModifier) that indicates that a
        given element is being defined. Expected to be used with the
        various [name](#highlight.tags.name) tags.
        */
        definition: Tag.defineModifier("definition"),
        /**
        [Modifier](#highlight.Tag^defineModifier) that indicates that
        something is constant. Mostly expected to be used with
        [variable names](#highlight.tags.variableName).
        */
        constant: Tag.defineModifier("constant"),
        /**
        [Modifier](#highlight.Tag^defineModifier) used to indicate that
        a [variable](#highlight.tags.variableName) or [property
        name](#highlight.tags.propertyName) is being called or defined
        as a function.
        */
        function: Tag.defineModifier("function"),
        /**
        [Modifier](#highlight.Tag^defineModifier) that can be applied to
        [names](#highlight.tags.name) to indicate that they belong to
        the language's standard environment.
        */
        standard: Tag.defineModifier("standard"),
        /**
        [Modifier](#highlight.Tag^defineModifier) that indicates a given
        [names](#highlight.tags.name) is local to some scope.
        */
        local: Tag.defineModifier("local"),
        /**
        A generic variant [modifier](#highlight.Tag^defineModifier) that
        can be used to tag language-specific alternative variants of
        some common tag. It is recommended for themes to define special
        forms of at least the [string](#highlight.tags.string) and
        [variable name](#highlight.tags.variableName) tags, since those
        come up a lot.
        */
        special: Tag.defineModifier("special")
    };
    for (let name in tags) {
        let val = tags[name];
        if (val instanceof Tag)
            val.name = name;
    }
    /**
    This is a highlighter that adds stable, predictable classes to
    tokens, for styling with external CSS.

    The following tags are mapped to their name prefixed with `"tok-"`
    (for example `"tok-comment"`):

    * [`link`](#highlight.tags.link)
    * [`heading`](#highlight.tags.heading)
    * [`emphasis`](#highlight.tags.emphasis)
    * [`strong`](#highlight.tags.strong)
    * [`keyword`](#highlight.tags.keyword)
    * [`atom`](#highlight.tags.atom)
    * [`bool`](#highlight.tags.bool)
    * [`url`](#highlight.tags.url)
    * [`labelName`](#highlight.tags.labelName)
    * [`inserted`](#highlight.tags.inserted)
    * [`deleted`](#highlight.tags.deleted)
    * [`literal`](#highlight.tags.literal)
    * [`string`](#highlight.tags.string)
    * [`number`](#highlight.tags.number)
    * [`variableName`](#highlight.tags.variableName)
    * [`typeName`](#highlight.tags.typeName)
    * [`namespace`](#highlight.tags.namespace)
    * [`className`](#highlight.tags.className)
    * [`macroName`](#highlight.tags.macroName)
    * [`propertyName`](#highlight.tags.propertyName)
    * [`operator`](#highlight.tags.operator)
    * [`comment`](#highlight.tags.comment)
    * [`meta`](#highlight.tags.meta)
    * [`punctuation`](#highlight.tags.punctuation)
    * [`invalid`](#highlight.tags.invalid)

    In addition, these mappings are provided:

    * [`regexp`](#highlight.tags.regexp),
      [`escape`](#highlight.tags.escape), and
      [`special`](#highlight.tags.special)[`(string)`](#highlight.tags.string)
      are mapped to `"tok-string2"`
    * [`special`](#highlight.tags.special)[`(variableName)`](#highlight.tags.variableName)
      to `"tok-variableName2"`
    * [`local`](#highlight.tags.local)[`(variableName)`](#highlight.tags.variableName)
      to `"tok-variableName tok-local"`
    * [`definition`](#highlight.tags.definition)[`(variableName)`](#highlight.tags.variableName)
      to `"tok-variableName tok-definition"`
    * [`definition`](#highlight.tags.definition)[`(propertyName)`](#highlight.tags.propertyName)
      to `"tok-propertyName tok-definition"`
    */
    tagHighlighter([
        { tag: tags.link, class: "tok-link" },
        { tag: tags.heading, class: "tok-heading" },
        { tag: tags.emphasis, class: "tok-emphasis" },
        { tag: tags.strong, class: "tok-strong" },
        { tag: tags.keyword, class: "tok-keyword" },
        { tag: tags.atom, class: "tok-atom" },
        { tag: tags.bool, class: "tok-bool" },
        { tag: tags.url, class: "tok-url" },
        { tag: tags.labelName, class: "tok-labelName" },
        { tag: tags.inserted, class: "tok-inserted" },
        { tag: tags.deleted, class: "tok-deleted" },
        { tag: tags.literal, class: "tok-literal" },
        { tag: tags.string, class: "tok-string" },
        { tag: tags.number, class: "tok-number" },
        { tag: [tags.regexp, tags.escape, tags.special(tags.string)], class: "tok-string2" },
        { tag: tags.variableName, class: "tok-variableName" },
        { tag: tags.local(tags.variableName), class: "tok-variableName tok-local" },
        { tag: tags.definition(tags.variableName), class: "tok-variableName tok-definition" },
        { tag: tags.special(tags.variableName), class: "tok-variableName2" },
        { tag: tags.definition(tags.propertyName), class: "tok-propertyName tok-definition" },
        { tag: tags.typeName, class: "tok-typeName" },
        { tag: tags.namespace, class: "tok-namespace" },
        { tag: tags.className, class: "tok-className" },
        { tag: tags.macroName, class: "tok-macroName" },
        { tag: tags.propertyName, class: "tok-propertyName" },
        { tag: tags.operator, class: "tok-operator" },
        { tag: tags.comment, class: "tok-comment" },
        { tag: tags.meta, class: "tok-meta" },
        { tag: tags.invalid, class: "tok-invalid" },
        { tag: tags.punctuation, class: "tok-punctuation" }
    ]);

    const jsHighlight = styleTags({
      "get set async static": tags.modifier,
      "for while do if else switch try catch finally return throw break continue default case": tags.controlKeyword,
      "in of await yield void typeof delete instanceof as satisfies": tags.operatorKeyword,
      "let var const using function class extends": tags.definitionKeyword,
      "import export from": tags.moduleKeyword,
      "with debugger new": tags.keyword,
      TemplateString: tags.special(tags.string),
      super: tags.atom,
      BooleanLiteral: tags.bool,
      this: tags.self,
      null: tags.null,
      Star: tags.modifier,
      VariableName: tags.variableName,
      "CallExpression/VariableName TaggedTemplateExpression/VariableName": tags.function(tags.variableName),
      VariableDefinition: tags.definition(tags.variableName),
      Label: tags.labelName,
      PropertyName: tags.propertyName,
      PrivatePropertyName: tags.special(tags.propertyName),
      "CallExpression/MemberExpression/PropertyName": tags.function(tags.propertyName),
      "FunctionDeclaration/VariableDefinition": tags.function(tags.definition(tags.variableName)),
      "ClassDeclaration/VariableDefinition": tags.definition(tags.className),
      "NewExpression/VariableName": tags.className,
      PropertyDefinition: tags.definition(tags.propertyName),
      PrivatePropertyDefinition: tags.definition(tags.special(tags.propertyName)),
      UpdateOp: tags.updateOperator,
      "LineComment Hashbang": tags.lineComment,
      BlockComment: tags.blockComment,
      Number: tags.number,
      String: tags.string,
      Escape: tags.escape,
      ArithOp: tags.arithmeticOperator,
      LogicOp: tags.logicOperator,
      BitOp: tags.bitwiseOperator,
      CompareOp: tags.compareOperator,
      RegExp: tags.regexp,
      Equals: tags.definitionOperator,
      Arrow: tags.function(tags.punctuation),
      ": Spread": tags.punctuation,
      "( )": tags.paren,
      "[ ]": tags.squareBracket,
      "{ }": tags.brace,
      "InterpolationStart InterpolationEnd": tags.special(tags.brace),
      ".": tags.derefOperator,
      ", ;": tags.separator,
      "@": tags.meta,

      TypeName: tags.typeName,
      TypeDefinition: tags.definition(tags.typeName),
      "type enum interface implements namespace module declare": tags.definitionKeyword,
      "abstract global Privacy readonly override": tags.modifier,
      "is keyof unique infer asserts": tags.operatorKeyword,

      JSXAttributeValue: tags.attributeValue,
      JSXText: tags.content,
      "JSXStartTag JSXStartCloseTag JSXSelfCloseEndTag JSXEndTag": tags.angleBracket,
      "JSXIdentifier JSXNameSpacedName": tags.tagName,
      "JSXAttribute/JSXIdentifier JSXAttribute/JSXNameSpacedName": tags.attributeName,
      "JSXBuiltin/JSXIdentifier": tags.standard(tags.tagName)
    });

    // This file was generated by lezer-generator. You probably shouldn't edit it.
    const spec_identifier = {__proto__:null,export:20, as:25, from:33, default:36, async:41, function:42, in:52, out:55, const:56, extends:60, this:64, true:72, false:72, null:84, void:88, typeof:92, super:108, new:142, delete:154, yield:163, await:167, class:172, public:235, private:235, protected:235, readonly:237, instanceof:256, satisfies:259, import:292, keyof:349, unique:353, infer:359, asserts:395, is:397, abstract:417, implements:419, type:421, let:424, var:426, using:429, interface:435, enum:439, namespace:445, module:447, declare:451, global:455, for:474, of:483, while:486, with:490, do:494, if:498, else:500, switch:504, case:510, try:516, catch:520, finally:524, return:528, throw:532, break:536, continue:540, debugger:544};
    const spec_word = {__proto__:null,async:129, get:131, set:133, declare:195, public:197, private:197, protected:197, static:199, abstract:201, override:203, readonly:209, accessor:211, new:401};
    const spec_LessThan = {__proto__:null,"<":193};
    const parser = LRParser.deserialize({
      version: 14,
      states: "$EOQ%TQlOOO%[QlOOO'_QpOOP(lO`OOO*zQ!0MxO'#CiO+RO#tO'#CjO+aO&jO'#CjO+oO#@ItO'#DaO.QQlO'#DgO.bQlO'#DrO%[QlO'#DzO0fQlO'#ESOOQ!0Lf'#E['#E[O1PQ`O'#EXOOQO'#Ep'#EpOOQO'#Ik'#IkO1XQ`O'#GsO1dQ`O'#EoO1iQ`O'#EoO3hQ!0MxO'#JqO6[Q!0MxO'#JrO6uQ`O'#F]O6zQ,UO'#FtOOQ!0Lf'#Ff'#FfO7VO7dO'#FfO7eQMhO'#F|O9[Q`O'#F{OOQ!0Lf'#Jr'#JrOOQ!0Lb'#Jq'#JqO9aQ`O'#GwOOQ['#K^'#K^O9lQ`O'#IXO9qQ!0LrO'#IYOOQ['#J_'#J_OOQ['#I^'#I^Q`QlOOQ`QlOOO9yQ!L^O'#DvO:QQlO'#EOO:XQlO'#EQO9gQ`O'#GsO:`QMhO'#CoO:nQ`O'#EnO:yQ`O'#EyO;OQMhO'#FeO;mQ`O'#GsOOQO'#K_'#K_O;rQ`O'#K_O<QQ`O'#G{O<QQ`O'#G|O<QQ`O'#HOO9gQ`O'#HRO<wQ`O'#HUO>`Q`O'#CeO>pQ`O'#HbO>xQ`O'#HhO>xQ`O'#HjO`QlO'#HlO>xQ`O'#HnO>xQ`O'#HqO>}Q`O'#HwO?SQ!0LsO'#H}O%[QlO'#IPO?_Q!0LsO'#IRO?jQ!0LsO'#ITO9qQ!0LrO'#IVO?uQ!0MxO'#CiO@wQpO'#DlQOQ`OOO%[QlO'#EQOA_Q`O'#ETO:`QMhO'#EnOAjQ`O'#EnOAuQ!bO'#FeOOQ['#Cg'#CgOOQ!0Lb'#Dq'#DqOOQ!0Lb'#Ju'#JuO%[QlO'#JuOOQO'#Jx'#JxOOQO'#Ig'#IgOBuQpO'#EgOOQ!0Lb'#Ef'#EfOOQ!0Lb'#J|'#J|OCqQ!0MSO'#EgOC{QpO'#EWOOQO'#Jw'#JwODaQpO'#JxOEnQpO'#EWOC{QpO'#EgPE{O&2DjO'#CbPOOO)CD|)CD|OOOO'#I_'#I_OFWO#tO,59UOOQ!0Lh,59U,59UOOOO'#I`'#I`OFfO&jO,59UOFtQ!L^O'#DcOOOO'#Ib'#IbOF{O#@ItO,59{OOQ!0Lf,59{,59{OGZQlO'#IcOGnQ`O'#JsOImQ!fO'#JsO+}QlO'#JsOItQ`O,5:ROJ[Q`O'#EpOJiQ`O'#KSOJtQ`O'#KROJtQ`O'#KROJ|Q`O,5;^OKRQ`O'#KQOOQ!0Ln,5:^,5:^OKYQlO,5:^OMWQ!0MxO,5:fOMwQ`O,5:nONbQ!0LrO'#KPONiQ`O'#KOO9aQ`O'#KOON}Q`O'#KOO! VQ`O,5;]O! [Q`O'#KOO!#aQ!fO'#JrOOQ!0Lh'#Ci'#CiO%[QlO'#ESO!$PQ!fO,5:sOOQS'#Jy'#JyOOQO-E<i-E<iO9gQ`O,5=_O!$gQ`O,5=_O!$lQlO,5;ZO!&oQMhO'#EkO!(YQ`O,5;ZO!(_QlO'#DyO!(iQpO,5;dO!(qQpO,5;dO%[QlO,5;dOOQ['#FT'#FTOOQ['#FV'#FVO%[QlO,5;eO%[QlO,5;eO%[QlO,5;eO%[QlO,5;eO%[QlO,5;eO%[QlO,5;eO%[QlO,5;eO%[QlO,5;eO%[QlO,5;eO%[QlO,5;eOOQ['#FZ'#FZO!)PQlO,5;tOOQ!0Lf,5;y,5;yOOQ!0Lf,5;z,5;zOOQ!0Lf,5;|,5;|O%[QlO'#IoO!+SQ!0LrO,5<iO%[QlO,5;eO!&oQMhO,5;eO!+qQMhO,5;eO!-cQMhO'#E^O%[QlO,5;wOOQ!0Lf,5;{,5;{O!-jQ,UO'#FjO!.gQ,UO'#KWO!.RQ,UO'#KWO!.nQ,UO'#KWOOQO'#KW'#KWO!/SQ,UO,5<SOOOW,5<`,5<`O!/eQlO'#FvOOOW'#In'#InO7VO7dO,5<QO!/lQ,UO'#FxOOQ!0Lf,5<Q,5<QO!0]Q$IUO'#CyOOQ!0Lh'#C}'#C}O!0pO#@ItO'#DRO!1^QMjO,5<eO!1eQ`O,5<hO!3QQ(CWO'#GXO!3_Q`O'#GYO!3dQ`O'#GYO!5SQ(CWO'#G^O!6XQpO'#GbOOQO'#Gn'#GnO!+xQMhO'#GmOOQO'#Gp'#GpO!+xQMhO'#GoO!6zQ$IUO'#JkOOQ!0Lh'#Jk'#JkO!7UQ`O'#JjO!7dQ`O'#JiO!7lQ`O'#CuOOQ!0Lh'#C{'#C{O!7}Q`O'#C}OOQ!0Lh'#DV'#DVOOQ!0Lh'#DX'#DXO1SQ`O'#DZO!+xQMhO'#GPO!+xQMhO'#GRO!8SQ`O'#GTO!8XQ`O'#GUO!3dQ`O'#G[O!+xQMhO'#GaO<QQ`O'#JjO!8^Q`O'#EqO!8{Q`O,5<gOOQ!0Lb'#Cr'#CrO!9TQ`O'#ErO!9}QpO'#EsOOQ!0Lb'#KQ'#KQO!:UQ!0LrO'#K`O9qQ!0LrO,5=cO`QlO,5>sOOQ['#Jg'#JgOOQ[,5>t,5>tOOQ[-E<[-E<[O!<TQ!0MxO,5:bO!9xQpO,5:`O!>nQ!0MxO,5:jO%[QlO,5:jO!AUQ!0MxO,5:lOOQO,5@y,5@yO!AuQMhO,5=_O!BTQ!0LrO'#JhO9[Q`O'#JhO!BfQ!0LrO,59ZO!BqQpO,59ZO!ByQMhO,59ZO:`QMhO,59ZO!CUQ`O,5;ZO!C^Q`O'#HaO!CrQ`O'#KcO%[QlO,5;}O!9xQpO,5<PO!CzQ`O,5=zO!DPQ`O,5=zO!DUQ`O,5=zO9qQ!0LrO,5=zO<QQ`O,5=jOOQO'#Cy'#CyO!DdQpO,5=gO!DlQMhO,5=hO!DwQ`O,5=jO!D|Q!bO,5=mO!EUQ`O'#K_O>}Q`O'#HWO9gQ`O'#HYO!EZQ`O'#HYO:`QMhO'#H[O!E`Q`O'#H[OOQ[,5=p,5=pO!EeQ`O'#H]O!EvQ`O'#CoO!E{Q`O,59PO!FVQ`O,59PO!H[QlO,59POOQ[,59P,59PO!HlQ!0LrO,59PO%[QlO,59PO!JwQlO'#HdOOQ['#He'#HeOOQ['#Hf'#HfO`QlO,5=|O!K_Q`O,5=|O`QlO,5>SO`QlO,5>UO!KdQ`O,5>WO`QlO,5>YO!KiQ`O,5>]O!KnQlO,5>cOOQ[,5>i,5>iO%[QlO,5>iO9qQ!0LrO,5>kOOQ[,5>m,5>mO# xQ`O,5>mOOQ[,5>o,5>oO# xQ`O,5>oOOQ[,5>q,5>qO#!fQpO'#D_O%[QlO'#JuO##XQpO'#JuO##cQpO'#DmO##tQpO'#DmO#&VQlO'#DmO#&^Q`O'#JtO#&fQ`O,5:WO#&kQ`O'#EtO#&yQ`O'#KTO#'RQ`O,5;_O#'WQpO'#DmO#'eQpO'#EVOOQ!0Lf,5:o,5:oO%[QlO,5:oO#'lQ`O,5:oO>}Q`O,5;YO!BqQpO,5;YO!ByQMhO,5;YO:`QMhO,5;YO#'tQ`O,5@aO#'yQ07dO,5:sOOQO-E<e-E<eO#)PQ!0MSO,5;ROC{QpO,5:rO#)ZQpO,5:rOC{QpO,5;RO!BfQ!0LrO,5:rOOQ!0Lb'#Ej'#EjOOQO,5;R,5;RO%[QlO,5;RO#)hQ!0LrO,5;RO#)sQ!0LrO,5;RO!BqQpO,5:rOOQO,5;X,5;XO#*RQ!0LrO,5;RPOOO'#I]'#I]P#*gO&2DjO,58|POOO,58|,58|OOOO-E<]-E<]OOQ!0Lh1G.p1G.pOOOO-E<^-E<^OOOO,59},59}O#*rQ!bO,59}OOOO-E<`-E<`OOQ!0Lf1G/g1G/gO#*wQ!fO,5>}O+}QlO,5>}OOQO,5?T,5?TO#+RQlO'#IcOOQO-E<a-E<aO#+`Q`O,5@_O#+hQ!fO,5@_O#+oQ`O,5@mOOQ!0Lf1G/m1G/mO%[QlO,5@nO#+wQ`O'#IiOOQO-E<g-E<gO#+oQ`O,5@mOOQ!0Lb1G0x1G0xOOQ!0Ln1G/x1G/xOOQ!0Ln1G0Y1G0YO%[QlO,5@kO#,]Q!0LrO,5@kO#,nQ!0LrO,5@kO#,uQ`O,5@jO9aQ`O,5@jO#,}Q`O,5@jO#-]Q`O'#IlO#,uQ`O,5@jOOQ!0Lb1G0w1G0wO!(iQpO,5:uO!(tQpO,5:uOOQS,5:w,5:wO#-}QdO,5:wO#.VQMhO1G2yO9gQ`O1G2yOOQ!0Lf1G0u1G0uO#.eQ!0MxO1G0uO#/jQ!0MvO,5;VOOQ!0Lh'#GW'#GWO#0WQ!0MzO'#JkO!$lQlO1G0uO#2cQ!fO'#JvO%[QlO'#JvO#2mQ`O,5:eOOQ!0Lh'#D_'#D_OOQ!0Lf1G1O1G1OO%[QlO1G1OOOQ!0Lf1G1f1G1fO#2rQ`O1G1OO#5WQ!0MxO1G1PO#5_Q!0MxO1G1PO#7uQ!0MxO1G1PO#7|Q!0MxO1G1PO#:dQ!0MxO1G1PO#<zQ!0MxO1G1PO#=RQ!0MxO1G1PO#=YQ!0MxO1G1PO#?pQ!0MxO1G1PO#?wQ!0MxO1G1PO#BUQ?MtO'#CiO#DPQ?MtO1G1`O#DWQ?MtO'#JrO#DkQ!0MxO,5?ZOOQ!0Lb-E<m-E<mO#FxQ!0MxO1G1PO#GuQ!0MzO1G1POOQ!0Lf1G1P1G1PO#HxQMjO'#J{O#ISQ`O,5:xO#IXQ!0MxO1G1cO#I{Q,UO,5<WO#JTQ,UO,5<XO#J]Q,UO'#FoO#JtQ`O'#FnOOQO'#KX'#KXOOQO'#Im'#ImO#JyQ,UO1G1nOOQ!0Lf1G1n1G1nOOOW1G1y1G1yO#K[Q?MtO'#JqO#KfQ`O,5<bO!)PQlO,5<bOOOW-E<l-E<lOOQ!0Lf1G1l1G1lO#KkQpO'#KWOOQ!0Lf,5<d,5<dO#KsQpO,5<dO#KxQMhO'#DTOOOO'#Ia'#IaO#LPO#@ItO,59mOOQ!0Lh,59m,59mO%[QlO1G2PO!8XQ`O'#IqO#L[Q`O,5<zOOQ!0Lh,5<w,5<wO!+xQMhO'#ItO#LxQMjO,5=XO!+xQMhO'#IvO#MkQMjO,5=ZO!&oQMhO,5=]OOQO1G2S1G2SO#MuQ!dO'#CrO#NYQ(CWO'#ErO$ _QpO'#GbO$ uQ!dO,5<sO$ |Q`O'#KZO9aQ`O'#KZO$![Q`O,5<uO!+xQMhO,5<tO$!aQ`O'#GZO$!rQ`O,5<tO$!wQ!dO'#GWO$#UQ!dO'#K[O$#`Q`O'#K[O!&oQMhO'#K[O$#eQ`O,5<xO$#jQlO'#JuO$#tQpO'#GcO##tQpO'#GcO$$VQ`O'#GgO!3dQ`O'#GkO$$[Q!0LrO'#IsO$$gQpO,5<|OOQ!0Lp,5<|,5<|O$$nQpO'#GcO$${QpO'#GdO$%^QpO'#GdO$%cQMjO,5=XO$%sQMjO,5=ZOOQ!0Lh,5=^,5=^O!+xQMhO,5@UO!+xQMhO,5@UO$&TQ`O'#IxO$&iQ`O,5@TO$&qQ`O,59aOOQ!0Lh,59i,59iO$'hQ$IYO,59uOOQ!0Lh'#Jo'#JoO$(ZQMjO,5<kO$(|QMjO,5<mO@oQ`O,5<oOOQ!0Lh,5<p,5<pO$)WQ`O,5<vO$)]QMjO,5<{O$)mQ`O,5@UO$){Q`O'#KOO!$lQlO1G2RO$*QQ`O1G2RO9aQ`O'#KRO9aQ`O'#EtO%[QlO'#EtO9aQ`O'#IzO$*VQ!0LrO,5@zOOQ[1G2}1G2}OOQ[1G4_1G4_OOQ!0Lf1G/|1G/|OOQ!0Lf1G/z1G/zO$,XQ!0MxO1G0UOOQ[1G2y1G2yO!&oQMhO1G2yO%[QlO1G2yO#.YQ`O1G2yO$.]QMhO'#EkOOQ!0Lb,5@S,5@SO$.jQ!0LrO,5@SOOQ[1G.u1G.uO!BfQ!0LrO1G.uO!BqQpO1G.uO!ByQMhO1G.uO$.{Q`O1G0uO$/QQ`O'#CiO$/]Q`O'#KdO$/eQ`O,5={O$/jQ`O'#KdO$/oQ`O'#KdO$/}Q`O'#JQO$0]Q`O,5@}O$0eQ!fO1G1iOOQ!0Lf1G1k1G1kO9gQ`O1G3fO@oQ`O1G3fO$0lQ`O1G3fO$0qQ`O1G3fOOQ[1G3f1G3fO!DwQ`O1G3UO!&oQMhO1G3RO$0vQ`O1G3ROOQ[1G3S1G3SO!&oQMhO1G3SO$0{Q`O1G3SO$1TQpO'#HQOOQ[1G3U1G3UO!6SQpO'#I|O!D|Q!bO1G3XOOQ[1G3X1G3XOOQ[,5=r,5=rO$1]QMhO,5=tO9gQ`O,5=tO$$VQ`O,5=vO9[Q`O,5=vO!BqQpO,5=vO!ByQMhO,5=vO:`QMhO,5=vO$1kQ`O'#KbO$1vQ`O,5=wOOQ[1G.k1G.kO$1{Q!0LrO1G.kO@oQ`O1G.kO$2WQ`O1G.kO9qQ!0LrO1G.kO$4`Q!fO,5APO$4mQ`O,5APO9aQ`O,5APO$4xQlO,5>OO$5PQ`O,5>OOOQ[1G3h1G3hO`QlO1G3hOOQ[1G3n1G3nOOQ[1G3p1G3pO>xQ`O1G3rO$5UQlO1G3tO$9YQlO'#HsOOQ[1G3w1G3wO$9gQ`O'#HyO>}Q`O'#H{OOQ[1G3}1G3}O$9oQlO1G3}O9qQ!0LrO1G4TOOQ[1G4V1G4VOOQ!0Lb'#G_'#G_O9qQ!0LrO1G4XO9qQ!0LrO1G4ZO$=vQ`O,5@aO!)PQlO,5;`O9aQ`O,5;`O>}Q`O,5:XO!)PQlO,5:XO!BqQpO,5:XO$={Q?MtO,5:XOOQO,5;`,5;`O$>VQpO'#IdO$>mQ`O,5@`OOQ!0Lf1G/r1G/rO$>uQpO'#IjO$?PQ`O,5@oOOQ!0Lb1G0y1G0yO##tQpO,5:XOOQO'#If'#IfO$?XQpO,5:qOOQ!0Ln,5:q,5:qO#'oQ`O1G0ZOOQ!0Lf1G0Z1G0ZO%[QlO1G0ZOOQ!0Lf1G0t1G0tO>}Q`O1G0tO!BqQpO1G0tO!ByQMhO1G0tOOQ!0Lb1G5{1G5{O!BfQ!0LrO1G0^OOQO1G0m1G0mO%[QlO1G0mO$?`Q!0LrO1G0mO$?kQ!0LrO1G0mO!BqQpO1G0^OC{QpO1G0^O$?yQ!0LrO1G0mOOQO1G0^1G0^O$@_Q!0MxO1G0mPOOO-E<Z-E<ZPOOO1G.h1G.hOOOO1G/i1G/iO$@iQ!bO,5<iO$@qQ!fO1G4iOOQO1G4o1G4oO%[QlO,5>}O$@{Q`O1G5yO$ATQ`O1G6XO$A]Q!fO1G6YO9aQ`O,5?TO$AgQ!0MxO1G6VO%[QlO1G6VO$AwQ!0LrO1G6VO$BYQ`O1G6UO$BYQ`O1G6UO9aQ`O1G6UO$BbQ`O,5?WO9aQ`O,5?WOOQO,5?W,5?WO$BvQ`O,5?WO$){Q`O,5?WOOQO-E<j-E<jOOQS1G0a1G0aOOQS1G0c1G0cO#.QQ`O1G0cOOQ[7+(e7+(eO!&oQMhO7+(eO%[QlO7+(eO$CUQ`O7+(eO$CaQMhO7+(eO$CoQ!0MzO,5=XO$EzQ!0MzO,5=ZO$HVQ!0MzO,5=XO$JhQ!0MzO,5=ZO$LyQ!0MzO,59uO% OQ!0MzO,5<kO%#ZQ!0MzO,5<mO%%fQ!0MzO,5<{OOQ!0Lf7+&a7+&aO%'wQ!0MxO7+&aO%(kQlO'#IeO%(xQ`O,5@bO%)QQ!fO,5@bOOQ!0Lf1G0P1G0PO%)[Q`O7+&jOOQ!0Lf7+&j7+&jO%)aQ?MtO,5:fO%[QlO7+&zO%)kQ?MtO,5:bO%)xQ?MtO,5:jO%*SQ?MtO,5:lO%*^QMhO'#IhO%*hQ`O,5@gOOQ!0Lh1G0d1G0dOOQO1G1r1G1rOOQO1G1s1G1sO%*pQ!jO,5<ZO!)PQlO,5<YOOQO-E<k-E<kOOQ!0Lf7+'Y7+'YOOOW7+'e7+'eOOOW1G1|1G1|O%*{Q`O1G1|OOQ!0Lf1G2O1G2OOOOO,59o,59oO%+QQ!dO,59oOOOO-E<_-E<_OOQ!0Lh1G/X1G/XO%+XQ!0MxO7+'kOOQ!0Lh,5?],5?]O%+{QMhO1G2fP%,SQ`O'#IqPOQ!0Lh-E<o-E<oO%,pQMjO,5?`OOQ!0Lh-E<r-E<rO%-cQMjO,5?bOOQ!0Lh-E<t-E<tO%-mQ!dO1G2wO%-tQ!dO'#CrO%.[QMhO'#KRO$#jQlO'#JuOOQ!0Lh1G2_1G2_O%.cQ`O'#IpO%.wQ`O,5@uO%.wQ`O,5@uO%/PQ`O,5@uO%/[Q`O,5@uOOQO1G2a1G2aO%/jQMjO1G2`O!+xQMhO1G2`O%/zQ(CWO'#IrO%0XQ`O,5@vO!&oQMhO,5@vO%0aQ!dO,5@vOOQ!0Lh1G2d1G2dO%2qQ!fO'#CiO%2{Q`O,5=POOQ!0Lb,5<},5<}O%3TQpO,5<}OOQ!0Lb,5=O,5=OOClQ`O,5<}O%3`QpO,5<}OOQ!0Lb,5=R,5=RO$){Q`O,5=VOOQO,5?_,5?_OOQO-E<q-E<qOOQ!0Lp1G2h1G2hO##tQpO,5<}O$#jQlO,5=PO%3nQ`O,5=OO%3yQpO,5=OO!+xQMhO'#ItO%4sQMjO1G2sO!+xQMhO'#IvO%5fQMjO1G2uO%5pQMjO1G5pO%5zQMjO1G5pOOQO,5?d,5?dOOQO-E<v-E<vOOQO1G.{1G.{O!9xQpO,59wO%[QlO,59wOOQ!0Lh,5<j,5<jO%6XQ`O1G2ZO!+xQMhO1G2bO!+xQMhO1G5pO!+xQMhO1G5pO%6^Q!0MxO7+'mOOQ!0Lf7+'m7+'mO!$lQlO7+'mO%7QQ`O,5;`OOQ!0Lb,5?f,5?fOOQ!0Lb-E<x-E<xO%7VQ!dO'#K]O#'oQ`O7+(eO4UQ!fO7+(eO$CXQ`O7+(eO%7aQ!0MvO'#CiO%7tQ!0MvO,5=SO%8fQ`O,5=SO%8nQ`O,5=SOOQ!0Lb1G5n1G5nOOQ[7+$a7+$aO!BfQ!0LrO7+$aO!BqQpO7+$aO!$lQlO7+&aO%8sQ`O'#JPO%9[Q`O,5AOOOQO1G3g1G3gO9gQ`O,5AOO%9[Q`O,5AOO%9dQ`O,5AOOOQO,5?l,5?lOOQO-E=O-E=OOOQ!0Lf7+'T7+'TO%9iQ`O7+)QO9qQ!0LrO7+)QO9gQ`O7+)QO@oQ`O7+)QOOQ[7+(p7+(pO%9nQ!0MvO7+(mO!&oQMhO7+(mO!DrQ`O7+(nOOQ[7+(n7+(nO!&oQMhO7+(nO%9xQ`O'#KaO%:TQ`O,5=lOOQO,5?h,5?hOOQO-E<z-E<zOOQ[7+(s7+(sO%;gQpO'#HZOOQ[1G3`1G3`O!&oQMhO1G3`O%[QlO1G3`O%;nQ`O1G3`O%;yQMhO1G3`O9qQ!0LrO1G3bO$$VQ`O1G3bO9[Q`O1G3bO!BqQpO1G3bO!ByQMhO1G3bO%<XQ`O'#JOO%<mQ`O,5@|O%<uQpO,5@|OOQ!0Lb1G3c1G3cOOQ[7+$V7+$VO@oQ`O7+$VO9qQ!0LrO7+$VO%=QQ`O7+$VO%[QlO1G6kO%[QlO1G6lO%=VQ!0LrO1G6kO%=aQlO1G3jO%=hQ`O1G3jO%=mQlO1G3jOOQ[7+)S7+)SO9qQ!0LrO7+)^O`QlO7+)`OOQ['#Kg'#KgOOQ['#JR'#JRO%=tQlO,5>_OOQ[,5>_,5>_O%[QlO'#HtO%>RQ`O'#HvOOQ[,5>e,5>eO9aQ`O,5>eOOQ[,5>g,5>gOOQ[7+)i7+)iOOQ[7+)o7+)oOOQ[7+)s7+)sOOQ[7+)u7+)uO%>WQpO1G5{O%>rQ?MtO1G0zO%>|Q`O1G0zOOQO1G/s1G/sO%?XQ?MtO1G/sO>}Q`O1G/sO!)PQlO'#DmOOQO,5?O,5?OOOQO-E<b-E<bOOQO,5?U,5?UOOQO-E<h-E<hO!BqQpO1G/sOOQO-E<d-E<dOOQ!0Ln1G0]1G0]OOQ!0Lf7+%u7+%uO#'oQ`O7+%uOOQ!0Lf7+&`7+&`O>}Q`O7+&`O!BqQpO7+&`OOQO7+%x7+%xO$@_Q!0MxO7+&XOOQO7+&X7+&XO%[QlO7+&XO%?cQ!0LrO7+&XO!BfQ!0LrO7+%xO!BqQpO7+%xO%?nQ!0LrO7+&XO%?|Q!0MxO7++qO%[QlO7++qO%@^Q`O7++pO%@^Q`O7++pOOQO1G4r1G4rO9aQ`O1G4rO%@fQ`O1G4rOOQS7+%}7+%}O#'oQ`O<<LPO4UQ!fO<<LPO%@tQ`O<<LPOOQ[<<LP<<LPO!&oQMhO<<LPO%[QlO<<LPO%@|Q`O<<LPO%AXQ!0MzO,5?`O%CdQ!0MzO,5?bO%EoQ!0MzO1G2`O%HQQ!0MzO1G2sO%J]Q!0MzO1G2uO%LhQ!fO,5?PO%[QlO,5?POOQO-E<c-E<cO%LrQ`O1G5|OOQ!0Lf<<JU<<JUO%LzQ?MtO1G0uO& RQ?MtO1G1PO& YQ?MtO1G1PO&#ZQ?MtO1G1PO&#bQ?MtO1G1PO&%cQ?MtO1G1PO&'dQ?MtO1G1PO&'kQ?MtO1G1PO&'rQ?MtO1G1PO&)sQ?MtO1G1PO&)zQ?MtO1G1PO&*RQ!0MxO<<JfO&+yQ?MtO1G1PO&,vQ?MvO1G1PO&-yQ?MvO'#JkO&0PQ?MtO1G1cO&0^Q?MtO1G0UO&0hQMjO,5?SOOQO-E<f-E<fO!)PQlO'#FqOOQO'#KY'#KYOOQO1G1u1G1uO&0rQ`O1G1tO&0wQ?MtO,5?ZOOOW7+'h7+'hOOOO1G/Z1G/ZO&1RQ!dO1G4wOOQ!0Lh7+(Q7+(QP!&oQMhO,5?]O!+xQMhO7+(cO&1YQ`O,5?[O9aQ`O,5?[OOQO-E<n-E<nO&1hQ`O1G6aO&1hQ`O1G6aO&1pQ`O1G6aO&1{QMjO7+'zO&2]Q!dO,5?^O&2gQ`O,5?^O!&oQMhO,5?^OOQO-E<p-E<pO&2lQ!dO1G6bO&2vQ`O1G6bO&3OQ`O1G2kO!&oQMhO1G2kOOQ!0Lb1G2i1G2iOOQ!0Lb1G2j1G2jO%3TQpO1G2iO!BqQpO1G2iOClQ`O1G2iOOQ!0Lb1G2q1G2qO&3TQpO1G2iO&3cQ`O1G2kO$){Q`O1G2jOClQ`O1G2jO$#jQlO1G2kO&3kQ`O1G2jO&4_QMjO,5?`OOQ!0Lh-E<s-E<sO&5QQMjO,5?bOOQ!0Lh-E<u-E<uO!+xQMhO7++[OOQ!0Lh1G/c1G/cO&5[Q`O1G/cOOQ!0Lh7+'u7+'uO&5aQMjO7+'|O&5qQMjO7++[O&5{QMjO7++[O&6YQ!0MxO<<KXOOQ!0Lf<<KX<<KXO&6|Q`O1G0zO!&oQMhO'#IyO&7RQ`O,5@wO&9TQ!fO<<LPO!&oQMhO1G2nO&9[Q!0LrO1G2nOOQ[<<G{<<G{O!BfQ!0LrO<<G{O&9mQ!0MxO<<I{OOQ!0Lf<<I{<<I{OOQO,5?k,5?kO&:aQ`O,5?kO&:fQ`O,5?kOOQO-E<}-E<}O&:tQ`O1G6jO&:tQ`O1G6jO9gQ`O1G6jO@oQ`O<<LlOOQ[<<Ll<<LlO&:|Q`O<<LlO9qQ!0LrO<<LlOOQ[<<LX<<LXO%9nQ!0MvO<<LXOOQ[<<LY<<LYO!DrQ`O<<LYO&;RQpO'#I{O&;^Q`O,5@{O!)PQlO,5@{OOQ[1G3W1G3WOOQO'#I}'#I}O9qQ!0LrO'#I}O&;fQpO,5=uOOQ[,5=u,5=uO&;mQpO'#EgO&;tQpO'#GeO&;yQ`O7+(zO&<OQ`O7+(zOOQ[7+(z7+(zO!&oQMhO7+(zO%[QlO7+(zO&<WQ`O7+(zOOQ[7+(|7+(|O9qQ!0LrO7+(|O$$VQ`O7+(|O9[Q`O7+(|O!BqQpO7+(|O&<cQ`O,5?jOOQO-E<|-E<|OOQO'#H^'#H^O&<nQ`O1G6hO9qQ!0LrO<<GqOOQ[<<Gq<<GqO@oQ`O<<GqO&<vQ`O7+,VO&<{Q`O7+,WO%[QlO7+,VO%[QlO7+,WOOQ[7+)U7+)UO&=QQ`O7+)UO&=VQlO7+)UO&=^Q`O7+)UOOQ[<<Lx<<LxOOQ[<<Lz<<LzOOQ[-E=P-E=POOQ[1G3y1G3yO&=cQ`O,5>`OOQ[,5>b,5>bO&=hQ`O1G4PO9aQ`O7+&fO!)PQlO7+&fOOQO7+%_7+%_O&=mQ?MtO1G6YO>}Q`O7+%_OOQ!0Lf<<Ia<<IaOOQ!0Lf<<Iz<<IzO>}Q`O<<IzOOQO<<Is<<IsO$@_Q!0MxO<<IsO%[QlO<<IsOOQO<<Id<<IdO!BfQ!0LrO<<IdO&=wQ!0LrO<<IsO&>SQ!0MxO<= ]O&>dQ`O<= [OOQO7+*^7+*^O9aQ`O7+*^OOQ[ANAkANAkO&>lQ!fOANAkO!&oQMhOANAkO#'oQ`OANAkO4UQ!fOANAkO&>sQ`OANAkO%[QlOANAkO&>{Q!0MzO7+'zO&A^Q!0MzO,5?`O&CiQ!0MzO,5?bO&EtQ!0MzO7+'|O&HVQ!fO1G4kO&HaQ?MtO7+&aO&JeQ?MvO,5=XO&LlQ?MvO,5=ZO&L|Q?MvO,5=XO&M^Q?MvO,5=ZO&MnQ?MvO,59uO' tQ?MvO,5<kO'#wQ?MvO,5<mO'&]Q?MvO,5<{O'(RQ?MtO7+'kO'(`Q?MtO7+'mO'(mQ`O,5<]OOQO7+'`7+'`OOQ!0Lh7+*c7+*cO'(rQMjO<<K}OOQO1G4v1G4vO'(yQ`O1G4vO')UQ`O1G4vO')dQ`O7++{O')dQ`O7++{O!&oQMhO1G4xO')lQ!dO1G4xO')vQ`O7++|O'*OQ`O7+(VO'*ZQ!dO7+(VOOQ!0Lb7+(T7+(TOOQ!0Lb7+(U7+(UO!BqQpO7+(TOClQ`O7+(TO'*eQ`O7+(VO!&oQMhO7+(VO$){Q`O7+(UO'*jQ`O7+(VOClQ`O7+(UO'*rQMjO<<NvOOQ!0Lh7+$}7+$}O!+xQMhO<<NvO'*|Q!dO,5?eOOQO-E<w-E<wO'+WQ!0MvO7+(YO!&oQMhO7+(YOOQ[AN=gAN=gO9gQ`O1G5VOOQO1G5V1G5VO'+hQ`O1G5VO'+mQ`O7+,UO'+mQ`O7+,UO9qQ!0LrOANBWO@oQ`OANBWOOQ[ANBWANBWOOQ[ANAsANAsOOQ[ANAtANAtO'+uQ`O,5?gOOQO-E<y-E<yO',QQ?MtO1G6gOOQO,5?i,5?iOOQO-E<{-E<{OOQ[1G3a1G3aO',[Q`O,5=POOQ[<<Lf<<LfO!&oQMhO<<LfO&;yQ`O<<LfO',aQ`O<<LfO%[QlO<<LfOOQ[<<Lh<<LhO9qQ!0LrO<<LhO$$VQ`O<<LhO9[Q`O<<LhO',iQpO1G5UO',tQ`O7+,SOOQ[AN=]AN=]O9qQ!0LrOAN=]OOQ[<= q<= qOOQ[<= r<= rO',|Q`O<= qO'-RQ`O<= rOOQ[<<Lp<<LpO'-WQ`O<<LpO'-]QlO<<LpOOQ[1G3z1G3zO>}Q`O7+)kO'-dQ`O<<JQO'-oQ?MtO<<JQOOQO<<Hy<<HyOOQ!0LfAN?fAN?fOOQOAN?_AN?_O$@_Q!0MxOAN?_OOQOAN?OAN?OO%[QlOAN?_OOQO<<Mx<<MxOOQ[G27VG27VO!&oQMhOG27VO#'oQ`OG27VO'-yQ!fOG27VO4UQ!fOG27VO'.QQ`OG27VO'.YQ?MtO<<JfO'.gQ?MvO1G2`O'0]Q?MvO,5?`O'2`Q?MvO,5?bO'4cQ?MvO1G2sO'6fQ?MvO1G2uO'8iQ?MtO<<KXO'8vQ?MtO<<I{OOQO1G1w1G1wO!+xQMhOANAiOOQO7+*b7+*bO'9TQ`O7+*bO'9`Q`O<= gO'9hQ!dO7+*dOOQ!0Lb<<Kq<<KqO$){Q`O<<KqOClQ`O<<KqO'9rQ`O<<KqO!&oQMhO<<KqOOQ!0Lb<<Ko<<KoO!BqQpO<<KoO'9}Q!dO<<KqOOQ!0Lb<<Kp<<KpO':XQ`O<<KqO!&oQMhO<<KqO$){Q`O<<KpO':^QMjOANDbO':hQ!0MvO<<KtOOQO7+*q7+*qO9gQ`O7+*qO':xQ`O<= pOOQ[G27rG27rO9qQ!0LrOG27rO!)PQlO1G5RO';QQ`O7+,RO';YQ`O1G2kO&;yQ`OANBQOOQ[ANBQANBQO!&oQMhOANBQO';_Q`OANBQOOQ[ANBSANBSO9qQ!0LrOANBSO$$VQ`OANBSOOQO'#H_'#H_OOQO7+*p7+*pOOQ[G22wG22wOOQ[ANE]ANE]OOQ[ANE^ANE^OOQ[ANB[ANB[O';gQ`OANB[OOQ[<<MV<<MVO!)PQlOAN?lOOQOG24yG24yO$@_Q!0MxOG24yO#'oQ`OLD,qOOQ[LD,qLD,qO!&oQMhOLD,qO';lQ!fOLD,qO';sQ?MvO7+'zO'=iQ?MvO,5?`O'?lQ?MvO,5?bO'AoQ?MvO7+'|O'CeQMjOG27TOOQO<<M|<<M|OOQ!0LbANA]ANA]O$){Q`OANA]OClQ`OANA]O'CuQ!dOANA]OOQ!0LbANAZANAZO'C|Q`OANA]O!&oQMhOANA]O'DXQ!dOANA]OOQ!0LbANA[ANA[OOQO<<N]<<N]OOQ[LD-^LD-^O'DcQ?MtO7+*mOOQO'#Gf'#GfOOQ[G27lG27lO&;yQ`OG27lO!&oQMhOG27lOOQ[G27nG27nO9qQ!0LrOG27nOOQ[G27vG27vO'DmQ?MtOG25WOOQOLD*eLD*eOOQ[!$(!]!$(!]O#'oQ`O!$(!]O!&oQMhO!$(!]O'DwQ!0MzOG27TOOQ!0LbG26wG26wO$){Q`OG26wO'GYQ`OG26wOClQ`OG26wO'GeQ!dOG26wO!&oQMhOG26wOOQ[LD-WLD-WO&;yQ`OLD-WOOQ[LD-YLD-YOOQ[!)9Ew!)9EwO#'oQ`O!)9EwOOQ!0LbLD,cLD,cO$){Q`OLD,cOClQ`OLD,cO'GlQ`OLD,cO'GwQ!dOLD,cOOQ[!$(!r!$(!rOOQ[!.K;c!.K;cO'HOQ?MvOG27TOOQ!0Lb!$( }!$( }O$){Q`O!$( }OClQ`O!$( }O'ItQ`O!$( }OOQ!0Lb!)9Ei!)9EiO$){Q`O!)9EiOClQ`O!)9EiOOQ!0Lb!.K;T!.K;TO$){Q`O!.K;TOOQ!0Lb!4/0o!4/0oO!)PQlO'#DzO1PQ`O'#EXO'JPQ!fO'#JqO'JWQ!L^O'#DvO'J_QlO'#EOO'JfQ!fO'#CiO'L|Q!fO'#CiO!)PQlO'#EQO'M^QlO,5;ZO!)PQlO,5;eO!)PQlO,5;eO!)PQlO,5;eO!)PQlO,5;eO!)PQlO,5;eO!)PQlO,5;eO!)PQlO,5;eO!)PQlO,5;eO!)PQlO,5;eO!)PQlO,5;eO!)PQlO'#IoO( aQ`O,5<iO!)PQlO,5;eO( iQMhO,5;eO(#SQMhO,5;eO!)PQlO,5;wO!&oQMhO'#GmO( iQMhO'#GmO!&oQMhO'#GoO( iQMhO'#GoO1SQ`O'#DZO1SQ`O'#DZO!&oQMhO'#GPO( iQMhO'#GPO!&oQMhO'#GRO( iQMhO'#GRO!&oQMhO'#GaO( iQMhO'#GaO!)PQlO,5:jO(#ZQpO'#D_O(#eQpO'#JuO!)PQlO,5@nO'M^QlO1G0uO(#oQ?MtO'#CiO!)PQlO1G2PO!&oQMhO'#ItO( iQMhO'#ItO!&oQMhO'#IvO( iQMhO'#IvO(#yQ!dO'#CrO!&oQMhO,5<tO( iQMhO,5<tO'M^QlO1G2RO!)PQlO7+&zO!&oQMhO1G2`O( iQMhO1G2`O!&oQMhO'#ItO( iQMhO'#ItO!&oQMhO'#IvO( iQMhO'#IvO!&oQMhO1G2bO( iQMhO1G2bO'M^QlO7+'mO'M^QlO7+&aO!&oQMhOANAiO( iQMhOANAiO($^Q`O'#EoO($cQ`O'#EoO($kQ`O'#F]O($pQ`O'#EyO($uQ`O'#KSO(%QQ`O'#KQO(%]Q`O,5;ZO(%bQMjO,5<eO(%iQ`O'#GYO(%nQ`O'#GYO(%sQ`O,5<gO(%{Q`O,5;ZO(&TQ?MtO1G1`O(&[Q`O,5<tO(&aQ`O,5<tO(&fQ`O,5<vO(&kQ`O,5<vO(&pQ`O1G2RO(&uQ`O1G0uO(&zQMjO<<K}O('RQMjO<<K}O7eQMhO'#F|O9[Q`O'#F{OAjQ`O'#EnO!)PQlO,5;tO!3dQ`O'#GYO!3dQ`O'#GYO!3dQ`O'#G[O!3dQ`O'#G[O!+xQMhO7+(cO!+xQMhO7+(cO%-mQ!dO1G2wO%-mQ!dO1G2wO!&oQMhO,5=]O!&oQMhO,5=]",
      stateData: "((X~O'{OS'|OSTOS'}RQ~OPYOQYOSfOY!VOaqOdzOeyOl!POpkOrYOskOtkOzkO|YO!OYO!SWO!WkO!XkO!_XO!iuO!lZO!oYO!pYO!qYO!svO!uwO!xxO!|]O$W|O$niO%h}O%j!QO%l!OO%m!OO%n!OO%q!RO%s!SO%v!TO%w!TO%y!UO&V!WO&]!XO&_!YO&a!ZO&c![O&f!]O&l!^O&r!_O&t!`O&v!aO&x!bO&z!cO(SSO(UTO(XUO(`VO(n[O~OWtO~P`OPYOQYOSfOd!jOe!iOpkOrYOskOtkOzkO|YO!OYO!SWO!WkO!XkO!_!eO!iuO!lZO!oYO!pYO!qYO!svO!u!gO!x!hO$W!kO$niO(S!dO(UTO(XUO(`VO(n[O~Oa!wOs!nO!S!oO!b!yO!c!vO!d!vO!|;wO#T!pO#U!pO#V!xO#W!pO#X!pO#[!zO#]!zO(T!lO(UTO(XUO(d!mO(n!sO~O'}!{O~OP]XR]X[]Xa]Xj]Xr]X!Q]X!S]X!]]X!l]X!p]X#R]X#S]X#`]X#kfX#n]X#o]X#p]X#q]X#r]X#s]X#t]X#u]X#v]X#x]X#z]X#{]X$Q]X'y]X(`]X(q]X(x]X(y]X~O!g%RX~P(qO_!}O(U#PO(V!}O(W#PO~O_#QO(W#PO(X#PO(Y#QO~Ox#SO!U#TO(a#TO(b#VO~OPYOQYOSfOd!jOe!iOpkOrYOskOtkOzkO|YO!OYO!SWO!WkO!XkO!_!eO!iuO!lZO!oYO!pYO!qYO!svO!u!gO!x!hO$W!kO$niO(S;{O(UTO(XUO(`VO(n[O~O![#ZO!]#WO!Y(gP!Y(uP~P+}O!^#cO~P`OPYOQYOSfOd!jOe!iOrYOskOtkOzkO|YO!OYO!SWO!WkO!XkO!_!eO!iuO!lZO!oYO!pYO!qYO!svO!u!gO!x!hO$W!kO$niO(UTO(XUO(`VO(n[O~Op#mO![#iO!|]O#i#lO#j#iO(S;|O!k(rP~P.iO!l#oO(S#nO~O!x#sO!|]O%h#tO~O#k#uO~O!g#vO#k#uO~OP$[OR#zO[$cOj$ROr$aO!Q#yO!S#{O!]$_O!l#xO!p$[O#R$RO#n$OO#o$PO#p$PO#q$PO#r$QO#s$RO#t$RO#u$bO#v$SO#x$UO#z$WO#{$XO(`VO(q$YO(x#|O(y#}O~Oa(eX'y(eX'v(eX!k(eX!Y(eX!_(eX%i(eX!g(eX~P1qO#S$dO#`$eO$Q$eOP(fXR(fX[(fXj(fXr(fX!Q(fX!S(fX!](fX!l(fX!p(fX#R(fX#n(fX#o(fX#p(fX#q(fX#r(fX#s(fX#t(fX#u(fX#v(fX#x(fX#z(fX#{(fX(`(fX(q(fX(x(fX(y(fX!_(fX%i(fX~Oa(fX'y(fX'v(fX!Y(fX!k(fXv(fX!g(fX~P4UO#`$eO~O$]$hO$_$gO$f$mO~OSfO!_$nO$i$oO$k$qO~Oh%VOj%cOk%cOl%cOp%WOr%XOs$tOt$tOz%YO|%ZO!O%[O!S${O!_$|O!i%aO!l$xO#j%bO$W%_O$t%]O$v%^O$y%`O(S$sO(UTO(XUO(`$uO(x$}O(y%POg(]P~O!l%dO~O!S%gO!_%hO(S%fO~O!g%lO~Oa%mO'y%mO~O!Q%qO~P%[O(T!lO~P%[O%n%uO~P%[Oh%VO!l%dO(S%fO(T!lO~Oe%|O!l%dO(S%fO~Oj$RO~O!Q&RO!_&OO!l&QO%j&UO(S%fO(T!lO(UTO(XUO`)VP~O!x#sO~O%s&WO!S)RX!_)RX(S)RX~O(S&XO~Ol!PO!u&^O%j!QO%l!OO%m!OO%n!OO%q!RO%s!SO%v!TO%w!TO~Od&cOe&bO!x&`O%h&aO%{&_O~P<VOd&fOeyOl!PO!_&eO!u&^O!xxO!|]O%h}O%l!OO%m!OO%n!OO%q!RO%s!SO%v!TO%w!TO%y!UO~Ob&iO#`&lO%j&gO(T!lO~P=[O!l&mO!u&qO~O!l#oO~O!_XO~Oa%mO'w&yO'y%mO~Oa%mO'w&|O'y%mO~Oa%mO'w'OO'y%mO~O'v]X!Y]Xv]X!k]X&Z]X!_]X%i]X!g]X~P(qO!b']O!c'UO!d'UO(T!lO(UTO(XUO~Os'SO!S'RO!['VO(d'QO!^(hP!^(wP~P@cOn'`O!_'^O(S%fO~Oe'eO!l%dO(S%fO~O!Q&RO!l&QO~Os!nO!S!oO!|;wO#T!pO#U!pO#W!pO#X!pO(T!lO(UTO(XUO(d!mO(n!sO~O!b'kO!c'jO!d'jO#V!pO#['lO#]'lO~PA}Oa%mOh%VO!g#vO!l%dO'y%mO(q'nO~O!p'rO#`'pO~PC]Os!nO!S!oO(UTO(XUO(d!mO(n!sO~O!_XOs(lX!S(lX!b(lX!c(lX!d(lX!|(lX#T(lX#U(lX#V(lX#W(lX#X(lX#[(lX#](lX(T(lX(U(lX(X(lX(d(lX(n(lX~O!c'jO!d'jO(T!lO~PC{O(O'vO(P'vO(Q'xO~O_!}O(U'zO(V!}O(W'zO~O_#QO(W'zO(X'zO(Y#QO~Ov'|O~P%[Ox#SO!U#TO(a#TO(b(PO~O![(RO!Y'VX!Y']X!]'VX!]']X~P+}O!](TO!Y(gX~OP$[OR#zO[$cOj$ROr$aO!Q#yO!S#{O!](TO!l#xO!p$[O#R$RO#n$OO#o$PO#p$PO#q$PO#r$QO#s$RO#t$RO#u$bO#v$SO#x$UO#z$WO#{$XO(`VO(q$YO(x#|O(y#}O~O!Y(gX~PGvO!Y(YO~O!Y(tX!](tX!g(tX!k(tX(q(tX~O#`(tX#k#dX!^(tX~PIyO#`(ZO!Y(vX!](vX~O!]([O!Y(uX~O!Y(_O~O#`$eO~PIyO!^(`O~P`OR#zO!Q#yO!S#{O!l#xO(`VOP!na[!naj!nar!na!]!na!p!na#R!na#n!na#o!na#p!na#q!na#r!na#s!na#t!na#u!na#v!na#x!na#z!na#{!na(q!na(x!na(y!na~Oa!na'y!na'v!na!Y!na!k!nav!na!_!na%i!na!g!na~PKaO!k(aO~O!g#vO#`(bO(q'nO!](sXa(sX'y(sX~O!k(sX~PM|O!S%gO!_%hO!|]O#i(gO#j(fO(S%fO~O!](hO!k(rX~O!k(jO~O!S%gO!_%hO#j(fO(S%fO~OP(fXR(fX[(fXj(fXr(fX!Q(fX!S(fX!](fX!l(fX!p(fX#R(fX#n(fX#o(fX#p(fX#q(fX#r(fX#s(fX#t(fX#u(fX#v(fX#x(fX#z(fX#{(fX(`(fX(q(fX(x(fX(y(fX~O!g#vO!k(fX~P! jOR(lO!Q(kO!l#xO#S$dO!|!{a!S!{a~O!x!{a%h!{a!_!{a#i!{a#j!{a(S!{a~P!#kO!x(pO~OPYOQYOSfOd!jOe!iOpkOrYOskOtkOzkO|YO!OYO!SWO!WkO!XkO!_XO!iuO!lZO!oYO!pYO!qYO!svO!u!gO!x!hO$W!kO$niO(S!dO(UTO(XUO(`VO(n[O~Oh%VOp%WOr%XOs$tOt$tOz%YO|%ZO!O<eO!S${O!_$|O!i=vO!l$xO#j<kO$W%_O$t<gO$v<iO$y%`O(S(tO(UTO(XUO(`$uO(x$}O(y%PO~O#k(vO~O![(xO!k(jP~P%[O(d(zO(n[O~O!S(|O!l#xO(d(zO(n[O~OP;vOQ;vOSfOd=rOe!iOpkOr;vOskOtkOzkO|;vO!O;vO!SWO!WkO!XkO!_!eO!i;yO!lZO!o;vO!p;vO!q;vO!s;zO!u;}O!x!hO$W!kO$n=pO(S)ZO(UTO(XUO(`VO(n[O~O!]$_Oa$qa'y$qa'v$qa!k$qa!Y$qa!_$qa%i$qa!g$qa~Ol)bO~P!&oOh%VOp%WOr%XOs$tOt$tOz%YO|%ZO!O%[O!S${O!_$|O!i%aO!l$xO#j%bO$W%_O$t%]O$v%^O$y%`O(S(tO(UTO(XUO(`$uO(x$}O(y%PO~Og(oP~P!+xO!Q)gO!g)fO!_$^X$Z$^X$]$^X$_$^X$f$^X~O!g)fO!_(zX$Z(zX$](zX$_(zX$f(zX~O!Q)gO~P!.RO!Q)gO!_(zX$Z(zX$](zX$_(zX$f(zX~O!_)iO$Z)mO$])hO$_)hO$f)nO~O![)qO~P!)PO$]$hO$_$gO$f)uO~On$zX!Q$zX#S$zX'x$zX(x$zX(y$zX~OgmXg$zXnmX!]mX#`mX~P!/wOx)wO(a)xO(b)zO~On*TO!Q)|O'x)}O(x$}O(y%PO~Og){O~P!0{Og*UO~Oh%VOp%WOr%XOs$tOt$tOz%YO|%ZO!O<eO!S*WO!_*XO!i=vO!l$xO#j<kO$W%_O$t<gO$v<iO$y%`O(UTO(XUO(`$uO(x$}O(y%PO~O![*[O(S*VO!k(}P~P!1jO#k*^O~O!l*_O~Oh%VOp%WOr%XOs$tOt$tOz%YO|%ZO!O<eO!S${O!_$|O!i=vO!l$xO#j<kO$W%_O$t<gO$v<iO$y%`O(S*aO(UTO(XUO(`$uO(x$}O(y%PO~O![*dO!Y)OP~P!3iOr*pOs!nO!S*fO!b*nO!c*hO!d*hO!l*_O#[*oO%`*jO(T!lO(UTO(XUO(d!mO~O!^*mO~P!5^O#S$dOn(_X!Q(_X'x(_X(x(_X(y(_X!](_X#`(_X~Og(_X$O(_X~P!6`On*uO#`*tOg(^X!](^X~O!]*vOg(]X~Oj%cOk%cOl%cO(S&XOg(]P~Os*yO~O!l+OO~O(S(tO~Op+TO!S%gO![#iO!_%hO!|]O#i#lO#j#iO(S%fO!k(rP~O!g#vO#k+UO~O!S%gO![+WO!]([O!_%hO(S%fO!Y(uP~Os'YO!S+YO![+XO(UTO(XUO(d(zO~O!^(wP~P!9iO!]+ZOa)SX'y)SX~OP$[OR#zO[$cOj$ROr$aO!Q#yO!S#{O!l#xO!p$[O#R$RO#n$OO#o$PO#p$PO#q$PO#r$QO#s$RO#t$RO#u$bO#v$SO#x$UO#z$WO#{$XO(`VO(q$YO(x#|O(y#}O~Oa!ja!]!ja'y!ja'v!ja!Y!ja!k!jav!ja!_!ja%i!ja!g!ja~P!:aOR#zO!Q#yO!S#{O!l#xO(`VOP!ra[!raj!rar!ra!]!ra!p!ra#R!ra#n!ra#o!ra#p!ra#q!ra#r!ra#s!ra#t!ra#u!ra#v!ra#x!ra#z!ra#{!ra(q!ra(x!ra(y!ra~Oa!ra'y!ra'v!ra!Y!ra!k!rav!ra!_!ra%i!ra!g!ra~P!<wOR#zO!Q#yO!S#{O!l#xO(`VOP!ta[!taj!tar!ta!]!ta!p!ta#R!ta#n!ta#o!ta#p!ta#q!ta#r!ta#s!ta#t!ta#u!ta#v!ta#x!ta#z!ta#{!ta(q!ta(x!ta(y!ta~Oa!ta'y!ta'v!ta!Y!ta!k!tav!ta!_!ta%i!ta!g!ta~P!?_Oh%VOn+dO!_'^O%i+cO~O!g+fOa([X!_([X'y([X!]([X~Oa%mO!_XO'y%mO~Oh%VO!l%dO~Oh%VO!l%dO(S%fO~O!g#vO#k(vO~Ob+qO%j+rO(S+nO(UTO(XUO!^)WP~O!]+sO`)VX~O[+wO~O`+xO~O!_&OO(S%fO(T!lO`)VP~Oh%VO#`+}O~Oh%VOn,QO!_$|O~O!_,SO~O!Q,UO!_XO~O%n%uO~O!x,ZO~Oe,`O~Ob,aO(S#nO(UTO(XUO!^)UP~Oe%|O~O%j!QO(S&XO~P=[O[,fO`,eO~OPYOQYOSfOdzOeyOpkOrYOskOtkOzkO|YO!OYO!SWO!WkO!XkO!iuO!lZO!oYO!pYO!qYO!svO!xxO!|]O$niO%h}O(UTO(XUO(`VO(n[O~O!_!eO!u!gO$W!kO(S!dO~P!F_O`,eOa%mO'y%mO~OPYOQYOSfOd!jOe!iOpkOrYOskOtkOzkO|YO!OYO!SWO!WkO!XkO!_!eO!iuO!lZO!oYO!pYO!qYO!svO!x!hO$W!kO$niO(S!dO(UTO(XUO(`VO(n[O~Oa,kOl!OO!uwO%l!OO%m!OO%n!OO~P!HwO!l&mO~O&],qO~O!_,sO~O&n,uO&p,vOP&kaQ&kaS&kaY&kaa&kad&kae&kal&kap&kar&kas&kat&kaz&ka|&ka!O&ka!S&ka!W&ka!X&ka!_&ka!i&ka!l&ka!o&ka!p&ka!q&ka!s&ka!u&ka!x&ka!|&ka$W&ka$n&ka%h&ka%j&ka%l&ka%m&ka%n&ka%q&ka%s&ka%v&ka%w&ka%y&ka&V&ka&]&ka&_&ka&a&ka&c&ka&f&ka&l&ka&r&ka&t&ka&v&ka&x&ka&z&ka'v&ka(S&ka(U&ka(X&ka(`&ka(n&ka!^&ka&d&kab&ka&i&ka~O(S,{O~Oh!eX!]!RX!^!RX!g!RX!g!eX!l!eX#`!RX~O!]!eX!^!eX~P# }O!g-QO#`-POh(iX!]#hX!^#hX!g(iX!l(iX~O!](iX!^(iX~P#!pOh%VO!g-SO!l%dO!]!aX!^!aX~Os!nO!S!oO(UTO(XUO(d!mO~OP;vOQ;vOSfOd=rOe!iOpkOr;vOskOtkOzkO|;vO!O;vO!SWO!WkO!XkO!_!eO!i;yO!lZO!o;vO!p;vO!q;vO!s;zO!u;}O!x!hO$W!kO$n=pO(UTO(XUO(`VO(n[O~O(S<rO~P#$VO!]-WO!^(hX~O!^-YO~O!g-QO#`-PO!]#hX!^#hX~O!]-ZO!^(wX~O!^-]O~O!c-^O!d-^O(T!lO~P##tO!^-aO~P'_On-dO!_'^O~O!Y-iO~Os!{a!b!{a!c!{a!d!{a#T!{a#U!{a#V!{a#W!{a#X!{a#[!{a#]!{a(T!{a(U!{a(X!{a(d!{a(n!{a~P!#kO!p-nO#`-lO~PC]O!c-pO!d-pO(T!lO~PC{Oa%mO#`-lO'y%mO~Oa%mO!g#vO#`-lO'y%mO~Oa%mO!g#vO!p-nO#`-lO'y%mO(q'nO~O(O'vO(P'vO(Q-uO~Ov-vO~O!Y'Va!]'Va~P!:aO![-zO!Y'VX!]'VX~P%[O!](TO!Y(ga~O!Y(ga~PGvO!]([O!Y(ua~O!S%gO![.OO!_%hO(S%fO!Y']X!]']X~O#`.QO!](sa!k(saa(sa'y(sa~O!g#vO~P#,]O!](hO!k(ra~O!S%gO!_%hO#j.UO(S%fO~Op.ZO!S%gO![.WO!_%hO!|]O#i.YO#j.WO(S%fO!]'`X!k'`X~OR._O!l#xO~Oh%VOn.bO!_'^O%i.aO~Oa#ci!]#ci'y#ci'v#ci!Y#ci!k#civ#ci!_#ci%i#ci!g#ci~P!:aOn=|O!Q)|O'x)}O(x$}O(y%PO~O#k#_aa#_a#`#_a'y#_a!]#_a!k#_a!_#_a!Y#_a~P#/XO#k(_XP(_XR(_X[(_Xa(_Xj(_Xr(_X!S(_X!l(_X!p(_X#R(_X#n(_X#o(_X#p(_X#q(_X#r(_X#s(_X#t(_X#u(_X#v(_X#x(_X#z(_X#{(_X'y(_X(`(_X(q(_X!k(_X!Y(_X'v(_Xv(_X!_(_X%i(_X!g(_X~P!6`O!].oO!k(jX~P!:aO!k.rO~O!Y.tO~OP$[OR#zO!Q#yO!S#{O!l#xO!p$[O(`VO[#mia#mij#mir#mi!]#mi#R#mi#o#mi#p#mi#q#mi#r#mi#s#mi#t#mi#u#mi#v#mi#x#mi#z#mi#{#mi'y#mi(q#mi(x#mi(y#mi'v#mi!Y#mi!k#miv#mi!_#mi%i#mi!g#mi~O#n#mi~P#2wO#n$OO~P#2wOP$[OR#zOr$aO!Q#yO!S#{O!l#xO!p$[O#n$OO#o$PO#p$PO#q$PO(`VO[#mia#mij#mi!]#mi#R#mi#s#mi#t#mi#u#mi#v#mi#x#mi#z#mi#{#mi'y#mi(q#mi(x#mi(y#mi'v#mi!Y#mi!k#miv#mi!_#mi%i#mi!g#mi~O#r#mi~P#5fO#r$QO~P#5fOP$[OR#zO[$cOj$ROr$aO!Q#yO!S#{O!l#xO!p$[O#R$RO#n$OO#o$PO#p$PO#q$PO#r$QO#s$RO#t$RO#u$bO(`VOa#mi!]#mi#x#mi#z#mi#{#mi'y#mi(q#mi(x#mi(y#mi'v#mi!Y#mi!k#miv#mi!_#mi%i#mi!g#mi~O#v#mi~P#8TOP$[OR#zO[$cOj$ROr$aO!Q#yO!S#{O!l#xO!p$[O#R$RO#n$OO#o$PO#p$PO#q$PO#r$QO#s$RO#t$RO#u$bO#v$SO(`VO(y#}Oa#mi!]#mi#z#mi#{#mi'y#mi(q#mi(x#mi'v#mi!Y#mi!k#miv#mi!_#mi%i#mi!g#mi~O#x$UO~P#:kO#x#mi~P#:kO#v$SO~P#8TOP$[OR#zO[$cOj$ROr$aO!Q#yO!S#{O!l#xO!p$[O#R$RO#n$OO#o$PO#p$PO#q$PO#r$QO#s$RO#t$RO#u$bO#v$SO#x$UO(`VO(x#|O(y#}Oa#mi!]#mi#{#mi'y#mi(q#mi'v#mi!Y#mi!k#miv#mi!_#mi%i#mi!g#mi~O#z#mi~P#=aO#z$WO~P#=aOP]XR]X[]Xj]Xr]X!Q]X!S]X!l]X!p]X#R]X#S]X#`]X#kfX#n]X#o]X#p]X#q]X#r]X#s]X#t]X#u]X#v]X#x]X#z]X#{]X$Q]X(`]X(q]X(x]X(y]X!]]X!^]X~O$O]X~P#@OOP$[OR#zO[<_Oj<SOr<]O!Q#yO!S#{O!l#xO!p$[O#R<SO#n<PO#o<QO#p<QO#q<QO#r<RO#s<SO#t<SO#u<^O#v<TO#x<VO#z<XO#{<YO(`VO(q$YO(x#|O(y#}O~O$O.vO~P#B]O#S$dO#`<`O$Q<`O$O(fX!^(fX~P! jOa'ca!]'ca'y'ca'v'ca!k'ca!Y'cav'ca!_'ca%i'ca!g'ca~P!:aO[#mia#mij#mir#mi!]#mi#R#mi#r#mi#s#mi#t#mi#u#mi#v#mi#x#mi#z#mi#{#mi'y#mi(q#mi'v#mi!Y#mi!k#miv#mi!_#mi%i#mi!g#mi~OP$[OR#zO!Q#yO!S#{O!l#xO!p$[O#n$OO#o$PO#p$PO#q$PO(`VO(x#mi(y#mi~P#E_On=|O!Q)|O'x)}O(x$}O(y%POP#miR#mi!S#mi!l#mi!p#mi#n#mi#o#mi#p#mi#q#mi(`#mi~P#E_O!].zOg(oX~P!0{Og.|O~Oa$Pi!]$Pi'y$Pi'v$Pi!Y$Pi!k$Piv$Pi!_$Pi%i$Pi!g$Pi~P!:aO$].}O$_.}O~O$]/OO$_/OO~O!g)fO#`/PO!_$cX$Z$cX$]$cX$_$cX$f$cX~O![/QO~O!_)iO$Z/SO$])hO$_)hO$f/TO~O!]<ZO!^(eX~P#B]O!^/UO~O!g)fO$f(zX~O$f/WO~Ov/XO~P!&oOx)wO(a)xO(b/[O~O!S/_O~O(x$}On%aa!Q%aa'x%aa(y%aa!]%aa#`%aa~Og%aa$O%aa~P#LaO(y%POn%ca!Q%ca'x%ca(x%ca!]%ca#`%ca~Og%ca$O%ca~P#MSO!]fX!gfX!kfX!k$zX(qfX~P!/wO![/hO!]([O(S/gO!Y(uP!Y)OP~P!1jOr*pO!b*nO!c*hO!d*hO!l*_O#[*oO%`*jO(T!lO(UTO(XUO~Os<oO!S/iO![+XO!^*mO(d<nO!^(wP~P#NmO!k/jO~P#/XO!]/kO!g#vO(q'nO!k(}X~O!k/pO~O!S%gO![*[O!_%hO(S%fO!k(}P~O#k/rO~O!Y$zX!]$zX!g%RX~P!/wO!]/sO!Y)OX~P#/XO!g/uO~O!Y/wO~OpkO(S/xO~P.iOh%VOr/}O!g#vO!l%dO(q'nO~O!g+fO~Oa%mO!]0RO'y%mO~O!^0TO~P!5^O!c0UO!d0UO(T!lO~P##tOs!nO!S0VO(UTO(XUO(d!mO~O#[0XO~Og%aa!]%aa#`%aa$O%aa~P!0{Og%ca!]%ca#`%ca$O%ca~P!0{Oj%cOk%cOl%cO(S&XOg'lX!]'lX~O!]*vOg(]a~Og0bO~OR0cO!Q0cO!S0dO#S$dOn}a'x}a(x}a(y}a!]}a#`}a~Og}a$O}a~P$&vO!Q)|O'x)}On$sa(x$sa(y$sa!]$sa#`$sa~Og$sa$O$sa~P$'rO!Q)|O'x)}On$ua(x$ua(y$ua!]$ua#`$ua~Og$ua$O$ua~P$(eO#k0gO~Og%Ta!]%Ta#`%Ta$O%Ta~P!0{On0iO#`0hOg(^a!](^a~O!g#vO~O#k0lO~O!]+ZOa)Sa'y)Sa~OR#zO!Q#yO!S#{O!l#xO(`VOP!ri[!rij!rir!ri!]!ri!p!ri#R!ri#n!ri#o!ri#p!ri#q!ri#r!ri#s!ri#t!ri#u!ri#v!ri#x!ri#z!ri#{!ri(q!ri(x!ri(y!ri~Oa!ri'y!ri'v!ri!Y!ri!k!riv!ri!_!ri%i!ri!g!ri~P$*bOh%VOr%XOs$tOt$tOz%YO|%ZO!O<eO!S${O!_$|O!i=vO!l$xO#j<kO$W%_O$t<gO$v<iO$y%`O(UTO(XUO(`$uO(x$}O(y%PO~Op0uO%]0vO(S0tO~P$,xO!g+fOa([a!_([a'y([a!]([a~O#k0|O~O[]X!]fX!^fX~O!]0}O!^)WX~O!^1PO~O[1QO~Ob1SO(S+nO(UTO(XUO~O!_&OO(S%fO`'tX!]'tX~O!]+sO`)Va~O!k1VO~P!:aO[1YO~O`1ZO~O#`1^O~On1aO!_$|O~O(d(zO!^)TP~Oh%VOn1jO!_1gO%i1iO~O[1tO!]1rO!^)UX~O!^1uO~O`1wOa%mO'y%mO~O(S#nO(UTO(XUO~O#S$dO#`$eO$Q$eOP(fXR(fX[(fXr(fX!Q(fX!S(fX!](fX!l(fX!p(fX#R(fX#n(fX#o(fX#p(fX#q(fX#r(fX#s(fX#t(fX#u(fX#v(fX#x(fX#z(fX#{(fX(`(fX(q(fX(x(fX(y(fX~Oj1zO&Z1{Oa(fX~P$2cOj1zO#`$eO&Z1{O~Oa1}O~P%[Oa2PO~O&d2SOP&biQ&biS&biY&bia&bid&bie&bil&bip&bir&bis&bit&biz&bi|&bi!O&bi!S&bi!W&bi!X&bi!_&bi!i&bi!l&bi!o&bi!p&bi!q&bi!s&bi!u&bi!x&bi!|&bi$W&bi$n&bi%h&bi%j&bi%l&bi%m&bi%n&bi%q&bi%s&bi%v&bi%w&bi%y&bi&V&bi&]&bi&_&bi&a&bi&c&bi&f&bi&l&bi&r&bi&t&bi&v&bi&x&bi&z&bi'v&bi(S&bi(U&bi(X&bi(`&bi(n&bi!^&bib&bi&i&bi~Ob2YO!^2WO&i2XO~P`O!_XO!l2[O~O&p,vOP&kiQ&kiS&kiY&kia&kid&kie&kil&kip&kir&kis&kit&kiz&ki|&ki!O&ki!S&ki!W&ki!X&ki!_&ki!i&ki!l&ki!o&ki!p&ki!q&ki!s&ki!u&ki!x&ki!|&ki$W&ki$n&ki%h&ki%j&ki%l&ki%m&ki%n&ki%q&ki%s&ki%v&ki%w&ki%y&ki&V&ki&]&ki&_&ki&a&ki&c&ki&f&ki&l&ki&r&ki&t&ki&v&ki&x&ki&z&ki'v&ki(S&ki(U&ki(X&ki(`&ki(n&ki!^&ki&d&kib&ki&i&ki~O!Y2bO~O!]!aa!^!aa~P#B]Os!nO!S!oO![2hO(d!mO!]'WX!^'WX~P@cO!]-WO!^(ha~O!]'^X!^'^X~P!9iO!]-ZO!^(wa~O!^2oO~P'_Oa%mO#`2xO'y%mO~Oa%mO!g#vO#`2xO'y%mO~Oa%mO!g#vO!p2|O#`2xO'y%mO(q'nO~Oa%mO'y%mO~P!:aO!]$_Ov$qa~O!Y'Vi!]'Vi~P!:aO!](TO!Y(gi~O!]([O!Y(ui~O!Y(vi!](vi~P!:aO!](si!k(sia(si'y(si~P!:aO#`3OO!](si!k(sia(si'y(si~O!](hO!k(ri~O!S%gO!_%hO!|]O#i3TO#j3SO(S%fO~O!S%gO!_%hO#j3SO(S%fO~On3[O!_'^O%i3ZO~Oh%VOn3[O!_'^O%i3ZO~O#k%aaP%aaR%aa[%aaa%aaj%aar%aa!S%aa!l%aa!p%aa#R%aa#n%aa#o%aa#p%aa#q%aa#r%aa#s%aa#t%aa#u%aa#v%aa#x%aa#z%aa#{%aa'y%aa(`%aa(q%aa!k%aa!Y%aa'v%aav%aa!_%aa%i%aa!g%aa~P#LaO#k%caP%caR%ca[%caa%caj%car%ca!S%ca!l%ca!p%ca#R%ca#n%ca#o%ca#p%ca#q%ca#r%ca#s%ca#t%ca#u%ca#v%ca#x%ca#z%ca#{%ca'y%ca(`%ca(q%ca!k%ca!Y%ca'v%cav%ca!_%ca%i%ca!g%ca~P#MSO#k%aaP%aaR%aa[%aaa%aaj%aar%aa!S%aa!]%aa!l%aa!p%aa#R%aa#n%aa#o%aa#p%aa#q%aa#r%aa#s%aa#t%aa#u%aa#v%aa#x%aa#z%aa#{%aa'y%aa(`%aa(q%aa!k%aa!Y%aa'v%aa#`%aav%aa!_%aa%i%aa!g%aa~P#/XO#k%caP%caR%ca[%caa%caj%car%ca!S%ca!]%ca!l%ca!p%ca#R%ca#n%ca#o%ca#p%ca#q%ca#r%ca#s%ca#t%ca#u%ca#v%ca#x%ca#z%ca#{%ca'y%ca(`%ca(q%ca!k%ca!Y%ca'v%ca#`%cav%ca!_%ca%i%ca!g%ca~P#/XO#k}aP}a[}aa}aj}ar}a!l}a!p}a#R}a#n}a#o}a#p}a#q}a#r}a#s}a#t}a#u}a#v}a#x}a#z}a#{}a'y}a(`}a(q}a!k}a!Y}a'v}av}a!_}a%i}a!g}a~P$&vO#k$saP$saR$sa[$saa$saj$sar$sa!S$sa!l$sa!p$sa#R$sa#n$sa#o$sa#p$sa#q$sa#r$sa#s$sa#t$sa#u$sa#v$sa#x$sa#z$sa#{$sa'y$sa(`$sa(q$sa!k$sa!Y$sa'v$sav$sa!_$sa%i$sa!g$sa~P$'rO#k$uaP$uaR$ua[$uaa$uaj$uar$ua!S$ua!l$ua!p$ua#R$ua#n$ua#o$ua#p$ua#q$ua#r$ua#s$ua#t$ua#u$ua#v$ua#x$ua#z$ua#{$ua'y$ua(`$ua(q$ua!k$ua!Y$ua'v$uav$ua!_$ua%i$ua!g$ua~P$(eO#k%TaP%TaR%Ta[%Taa%Taj%Tar%Ta!S%Ta!]%Ta!l%Ta!p%Ta#R%Ta#n%Ta#o%Ta#p%Ta#q%Ta#r%Ta#s%Ta#t%Ta#u%Ta#v%Ta#x%Ta#z%Ta#{%Ta'y%Ta(`%Ta(q%Ta!k%Ta!Y%Ta'v%Ta#`%Tav%Ta!_%Ta%i%Ta!g%Ta~P#/XOa#cq!]#cq'y#cq'v#cq!Y#cq!k#cqv#cq!_#cq%i#cq!g#cq~P!:aO![3dO!]'XX!k'XX~P%[O!].oO!k(ja~O!].oO!k(ja~P!:aO!Y3gO~O$O!na!^!na~PKaO$O!ja!]!ja!^!ja~P#B]O$O!ra!^!ra~P!<wO$O!ta!^!ta~P!?_Og'[X!]'[X~P!+xO!].zOg(oa~OSfO!_3{O$d3|O~O!^4QO~Ov4RO~P#/XOa$mq!]$mq'y$mq'v$mq!Y$mq!k$mqv$mq!_$mq%i$mq!g$mq~P!:aO!Y4TO~P!&oO!S4UO~O!Q)|O'x)}O(y%POn'ha(x'ha!]'ha#`'ha~Og'ha$O'ha~P%,XO!Q)|O'x)}On'ja(x'ja(y'ja!]'ja#`'ja~Og'ja$O'ja~P%,zO(q$YO~P#/XO!YfX!Y$zX!]fX!]$zX!g%RX#`fX~P!/wO(S<xO~P!1jO!S%gO![4XO!_%hO(S%fO!]'dX!k'dX~O!]/kO!k(}a~O!]/kO!g#vO!k(}a~O!]/kO!g#vO(q'nO!k(}a~Og$|i!]$|i#`$|i$O$|i~P!0{O![4aO!Y'fX!]'fX~P!3iO!]/sO!Y)Oa~O!]/sO!Y)Oa~P#/XOP]XR]X[]Xj]Xr]X!Q]X!S]X!Y]X!]]X!l]X!p]X#R]X#S]X#`]X#kfX#n]X#o]X#p]X#q]X#r]X#s]X#t]X#u]X#v]X#x]X#z]X#{]X$Q]X(`]X(q]X(x]X(y]X~Oj%YX!g%YX~P%0kOj4fO!g#vO~Oh%VO!g#vO!l%dO~Oh%VOr4kO!l%dO(q'nO~Or4pO!g#vO(q'nO~Os!nO!S4qO(UTO(XUO(d!mO~O(x$}On%ai!Q%ai'x%ai(y%ai!]%ai#`%ai~Og%ai$O%ai~P%4[O(y%POn%ci!Q%ci'x%ci(x%ci!]%ci#`%ci~Og%ci$O%ci~P%4}Og(^i!](^i~P!0{O#`4wOg(^i!](^i~P!0{O!k4zO~Oa$oq!]$oq'y$oq'v$oq!Y$oq!k$oqv$oq!_$oq%i$oq!g$oq~P!:aO!Y5QO~O!]5RO!_)PX~P#/XOa$zX!_$zX%^]X'y$zX!]$zX~P!/wO%^5UOaoXnoX!QoX!_oX'xoX'yoX(xoX(yoX!]oX~Op5VO(S#nO~O%^5UO~Ob5]O%j5^O(S+nO(UTO(XUO!]'sX!^'sX~O!]0}O!^)Wa~O[5bO~O`5cO~Oa%mO'y%mO~P#/XO!]5kO#`5mO!^)TX~O!^5nO~Or5tOs!nO!S*fO!b!yO!c!vO!d!vO!|;wO#T!pO#U!pO#V!pO#W!pO#X!pO#[5sO#]!zO(T!lO(UTO(XUO(d!mO(n!sO~O!^5rO~P%:YOn5yO!_1gO%i5xO~Oh%VOn5yO!_1gO%i5xO~Ob6QO(S#nO(UTO(XUO!]'rX!^'rX~O!]1rO!^)Ua~O(UTO(XUO(d6SO~O`6WO~Oj6ZO&Z6[O~PM|O!k6]O~P%[Oa6_O~Oa6_O~P%[Ob2YO!^6dO&i2XO~P`O!g6fO~O!g6hOh(ii!](ii!^(ii!g(ii!l(iir(ii(q(ii~O!]#hi!^#hi~P#B]O#`6iO!]#hi!^#hi~O!]!ai!^!ai~P#B]Oa%mO#`6rO'y%mO~Oa%mO!g#vO#`6rO'y%mO~O!](sq!k(sqa(sq'y(sq~P!:aO!](hO!k(rq~O!S%gO!_%hO#j6yO(S%fO~O!_'^O%i6|O~On7QO!_'^O%i6|O~O#k'haP'haR'ha['haa'haj'har'ha!S'ha!l'ha!p'ha#R'ha#n'ha#o'ha#p'ha#q'ha#r'ha#s'ha#t'ha#u'ha#v'ha#x'ha#z'ha#{'ha'y'ha(`'ha(q'ha!k'ha!Y'ha'v'hav'ha!_'ha%i'ha!g'ha~P%,XO#k'jaP'jaR'ja['jaa'jaj'jar'ja!S'ja!l'ja!p'ja#R'ja#n'ja#o'ja#p'ja#q'ja#r'ja#s'ja#t'ja#u'ja#v'ja#x'ja#z'ja#{'ja'y'ja(`'ja(q'ja!k'ja!Y'ja'v'jav'ja!_'ja%i'ja!g'ja~P%,zO#k$|iP$|iR$|i[$|ia$|ij$|ir$|i!S$|i!]$|i!l$|i!p$|i#R$|i#n$|i#o$|i#p$|i#q$|i#r$|i#s$|i#t$|i#u$|i#v$|i#x$|i#z$|i#{$|i'y$|i(`$|i(q$|i!k$|i!Y$|i'v$|i#`$|iv$|i!_$|i%i$|i!g$|i~P#/XO#k%aiP%aiR%ai[%aia%aij%air%ai!S%ai!l%ai!p%ai#R%ai#n%ai#o%ai#p%ai#q%ai#r%ai#s%ai#t%ai#u%ai#v%ai#x%ai#z%ai#{%ai'y%ai(`%ai(q%ai!k%ai!Y%ai'v%aiv%ai!_%ai%i%ai!g%ai~P%4[O#k%ciP%ciR%ci[%cia%cij%cir%ci!S%ci!l%ci!p%ci#R%ci#n%ci#o%ci#p%ci#q%ci#r%ci#s%ci#t%ci#u%ci#v%ci#x%ci#z%ci#{%ci'y%ci(`%ci(q%ci!k%ci!Y%ci'v%civ%ci!_%ci%i%ci!g%ci~P%4}O!]'Xa!k'Xa~P!:aO!].oO!k(ji~O$O#ci!]#ci!^#ci~P#B]OP$[OR#zO!Q#yO!S#{O!l#xO!p$[O(`VO[#mij#mir#mi#R#mi#o#mi#p#mi#q#mi#r#mi#s#mi#t#mi#u#mi#v#mi#x#mi#z#mi#{#mi$O#mi(q#mi(x#mi(y#mi!]#mi!^#mi~O#n#mi~P%MXO#n<PO~P%MXOP$[OR#zOr<]O!Q#yO!S#{O!l#xO!p$[O#n<PO#o<QO#p<QO#q<QO(`VO[#mij#mi#R#mi#s#mi#t#mi#u#mi#v#mi#x#mi#z#mi#{#mi$O#mi(q#mi(x#mi(y#mi!]#mi!^#mi~O#r#mi~P& aO#r<RO~P& aOP$[OR#zO[<_Oj<SOr<]O!Q#yO!S#{O!l#xO!p$[O#R<SO#n<PO#o<QO#p<QO#q<QO#r<RO#s<SO#t<SO#u<^O(`VO#x#mi#z#mi#{#mi$O#mi(q#mi(x#mi(y#mi!]#mi!^#mi~O#v#mi~P&#iOP$[OR#zO[<_Oj<SOr<]O!Q#yO!S#{O!l#xO!p$[O#R<SO#n<PO#o<QO#p<QO#q<QO#r<RO#s<SO#t<SO#u<^O#v<TO(`VO(y#}O#z#mi#{#mi$O#mi(q#mi(x#mi!]#mi!^#mi~O#x<VO~P&%jO#x#mi~P&%jO#v<TO~P&#iOP$[OR#zO[<_Oj<SOr<]O!Q#yO!S#{O!l#xO!p$[O#R<SO#n<PO#o<QO#p<QO#q<QO#r<RO#s<SO#t<SO#u<^O#v<TO#x<VO(`VO(x#|O(y#}O#{#mi$O#mi(q#mi!]#mi!^#mi~O#z#mi~P&'yO#z<XO~P&'yOa#|y!]#|y'y#|y'v#|y!Y#|y!k#|yv#|y!_#|y%i#|y!g#|y~P!:aO[#mij#mir#mi#R#mi#r#mi#s#mi#t#mi#u#mi#v#mi#x#mi#z#mi#{#mi$O#mi(q#mi!]#mi!^#mi~OP$[OR#zO!Q#yO!S#{O!l#xO!p$[O#n<PO#o<QO#p<QO#q<QO(`VO(x#mi(y#mi~P&*uOn=}O!Q)|O'x)}O(x$}O(y%POP#miR#mi!S#mi!l#mi!p#mi#n#mi#o#mi#p#mi#q#mi(`#mi~P&*uO#S$dOP(_XR(_X[(_Xj(_Xn(_Xr(_X!Q(_X!S(_X!l(_X!p(_X#R(_X#n(_X#o(_X#p(_X#q(_X#r(_X#s(_X#t(_X#u(_X#v(_X#x(_X#z(_X#{(_X$O(_X'x(_X(`(_X(q(_X(x(_X(y(_X!](_X!^(_X~O$O$Pi!]$Pi!^$Pi~P#B]O$O!ri!^!ri~P$*bOg'[a!]'[a~P!0{O!^7dO~O!]'ca!^'ca~P#B]O!Y7eO~P#/XO!g#vO(q'nO!]'da!k'da~O!]/kO!k(}i~O!]/kO!g#vO!k(}i~Og$|q!]$|q#`$|q$O$|q~P!0{O!Y'fa!]'fa~P#/XO!g7lO~O!]/sO!Y)Oi~P#/XO!]/sO!Y)Oi~O!Y7oO~Oh%VOr7tO!l%dO(q'nO~Oj7vO!g#vO~Or7yO!g#vO(q'nO~O!Q)|O'x)}O(y%POn'ia(x'ia!]'ia#`'ia~Og'ia$O'ia~P&3vO!Q)|O'x)}On'ka(x'ka(y'ka!]'ka#`'ka~Og'ka$O'ka~P&4iO!Y7{O~Og%Oq!]%Oq#`%Oq$O%Oq~P!0{Og(^q!](^q~P!0{O#`7|Og(^q!](^q~P!0{Oa$oy!]$oy'y$oy'v$oy!Y$oy!k$oyv$oy!_$oy%i$oy!g$oy~P!:aO!g6hO~O!]5RO!_)Pa~O!_'^OP$TaR$Ta[$Taj$Tar$Ta!Q$Ta!S$Ta!]$Ta!l$Ta!p$Ta#R$Ta#n$Ta#o$Ta#p$Ta#q$Ta#r$Ta#s$Ta#t$Ta#u$Ta#v$Ta#x$Ta#z$Ta#{$Ta(`$Ta(q$Ta(x$Ta(y$Ta~O%i6|O~P&7ZO%^8QOa%[i!_%[i'y%[i!]%[i~Oa#cy!]#cy'y#cy'v#cy!Y#cy!k#cyv#cy!_#cy%i#cy!g#cy~P!:aO[8SO~Ob8UO(S+nO(UTO(XUO~O!]0}O!^)Wi~O`8YO~O(d(zO!]'oX!^'oX~O!]5kO!^)Ta~O!^8cO~P%:YO(n!sO~P$${O#[8dO~O!_1gO~O!_1gO%i8fO~On8iO!_1gO%i8fO~O[8nO!]'ra!^'ra~O!]1rO!^)Ui~O!k8rO~O!k8sO~O!k8vO~O!k8vO~P%[Oa8xO~O!g8yO~O!k8zO~O!](vi!^(vi~P#B]Oa%mO#`9SO'y%mO~O!](sy!k(sya(sy'y(sy~P!:aO!](hO!k(ry~O%i9VO~P&7ZO!_'^O%i9VO~O#k$|qP$|qR$|q[$|qa$|qj$|qr$|q!S$|q!]$|q!l$|q!p$|q#R$|q#n$|q#o$|q#p$|q#q$|q#r$|q#s$|q#t$|q#u$|q#v$|q#x$|q#z$|q#{$|q'y$|q(`$|q(q$|q!k$|q!Y$|q'v$|q#`$|qv$|q!_$|q%i$|q!g$|q~P#/XO#k'iaP'iaR'ia['iaa'iaj'iar'ia!S'ia!l'ia!p'ia#R'ia#n'ia#o'ia#p'ia#q'ia#r'ia#s'ia#t'ia#u'ia#v'ia#x'ia#z'ia#{'ia'y'ia(`'ia(q'ia!k'ia!Y'ia'v'iav'ia!_'ia%i'ia!g'ia~P&3vO#k'kaP'kaR'ka['kaa'kaj'kar'ka!S'ka!l'ka!p'ka#R'ka#n'ka#o'ka#p'ka#q'ka#r'ka#s'ka#t'ka#u'ka#v'ka#x'ka#z'ka#{'ka'y'ka(`'ka(q'ka!k'ka!Y'ka'v'kav'ka!_'ka%i'ka!g'ka~P&4iO#k%OqP%OqR%Oq[%Oqa%Oqj%Oqr%Oq!S%Oq!]%Oq!l%Oq!p%Oq#R%Oq#n%Oq#o%Oq#p%Oq#q%Oq#r%Oq#s%Oq#t%Oq#u%Oq#v%Oq#x%Oq#z%Oq#{%Oq'y%Oq(`%Oq(q%Oq!k%Oq!Y%Oq'v%Oq#`%Oqv%Oq!_%Oq%i%Oq!g%Oq~P#/XO!]'Xi!k'Xi~P!:aO$O#cq!]#cq!^#cq~P#B]O(x$}OP%aaR%aa[%aaj%aar%aa!S%aa!l%aa!p%aa#R%aa#n%aa#o%aa#p%aa#q%aa#r%aa#s%aa#t%aa#u%aa#v%aa#x%aa#z%aa#{%aa$O%aa(`%aa(q%aa!]%aa!^%aa~On%aa!Q%aa'x%aa(y%aa~P&HnO(y%POP%caR%ca[%caj%car%ca!S%ca!l%ca!p%ca#R%ca#n%ca#o%ca#p%ca#q%ca#r%ca#s%ca#t%ca#u%ca#v%ca#x%ca#z%ca#{%ca$O%ca(`%ca(q%ca!]%ca!^%ca~On%ca!Q%ca'x%ca(x%ca~P&JuOn=}O!Q)|O'x)}O(y%PO~P&HnOn=}O!Q)|O'x)}O(x$}O~P&JuOR0cO!Q0cO!S0dO#S$dOP}a[}aj}an}ar}a!l}a!p}a#R}a#n}a#o}a#p}a#q}a#r}a#s}a#t}a#u}a#v}a#x}a#z}a#{}a$O}a'x}a(`}a(q}a(x}a(y}a!]}a!^}a~O!Q)|O'x)}OP$saR$sa[$saj$san$sar$sa!S$sa!l$sa!p$sa#R$sa#n$sa#o$sa#p$sa#q$sa#r$sa#s$sa#t$sa#u$sa#v$sa#x$sa#z$sa#{$sa$O$sa(`$sa(q$sa(x$sa(y$sa!]$sa!^$sa~O!Q)|O'x)}OP$uaR$ua[$uaj$uan$uar$ua!S$ua!l$ua!p$ua#R$ua#n$ua#o$ua#p$ua#q$ua#r$ua#s$ua#t$ua#u$ua#v$ua#x$ua#z$ua#{$ua$O$ua(`$ua(q$ua(x$ua(y$ua!]$ua!^$ua~On=}O!Q)|O'x)}O(x$}O(y%PO~OP%TaR%Ta[%Taj%Tar%Ta!S%Ta!l%Ta!p%Ta#R%Ta#n%Ta#o%Ta#p%Ta#q%Ta#r%Ta#s%Ta#t%Ta#u%Ta#v%Ta#x%Ta#z%Ta#{%Ta$O%Ta(`%Ta(q%Ta!]%Ta!^%Ta~P'%zO$O$mq!]$mq!^$mq~P#B]O$O$oq!]$oq!^$oq~P#B]O!^9dO~O$O9eO~P!0{O!g#vO!]'di!k'di~O!g#vO(q'nO!]'di!k'di~O!]/kO!k(}q~O!Y'fi!]'fi~P#/XO!]/sO!Y)Oq~Or9lO!g#vO(q'nO~O[9nO!Y9mO~P#/XO!Y9mO~Oj9tO!g#vO~Og(^y!](^y~P!0{O!]'ma!_'ma~P#/XOa%[q!_%[q'y%[q!]%[q~P#/XO[9yO~O!]0}O!^)Wq~O#`9}O!]'oa!^'oa~O!]5kO!^)Ti~P#B]O!S:PO~O!_1gO%i:SO~O(UTO(XUO(d:XO~O!]1rO!^)Uq~O!k:[O~O!k:]O~O!k:^O~O!k:^O~P%[O#`:aO!]#hy!^#hy~O!]#hy!^#hy~P#B]O%i:fO~P&7ZO!_'^O%i:fO~O$O#|y!]#|y!^#|y~P#B]OP$|iR$|i[$|ij$|ir$|i!S$|i!l$|i!p$|i#R$|i#n$|i#o$|i#p$|i#q$|i#r$|i#s$|i#t$|i#u$|i#v$|i#x$|i#z$|i#{$|i$O$|i(`$|i(q$|i!]$|i!^$|i~P'%zO!Q)|O'x)}O(y%POP'haR'ha['haj'han'har'ha!S'ha!l'ha!p'ha#R'ha#n'ha#o'ha#p'ha#q'ha#r'ha#s'ha#t'ha#u'ha#v'ha#x'ha#z'ha#{'ha$O'ha(`'ha(q'ha(x'ha!]'ha!^'ha~O!Q)|O'x)}OP'jaR'ja['jaj'jan'jar'ja!S'ja!l'ja!p'ja#R'ja#n'ja#o'ja#p'ja#q'ja#r'ja#s'ja#t'ja#u'ja#v'ja#x'ja#z'ja#{'ja$O'ja(`'ja(q'ja(x'ja(y'ja!]'ja!^'ja~O(x$}OP%aiR%ai[%aij%ain%air%ai!Q%ai!S%ai!l%ai!p%ai#R%ai#n%ai#o%ai#p%ai#q%ai#r%ai#s%ai#t%ai#u%ai#v%ai#x%ai#z%ai#{%ai$O%ai'x%ai(`%ai(q%ai(y%ai!]%ai!^%ai~O(y%POP%ciR%ci[%cij%cin%cir%ci!Q%ci!S%ci!l%ci!p%ci#R%ci#n%ci#o%ci#p%ci#q%ci#r%ci#s%ci#t%ci#u%ci#v%ci#x%ci#z%ci#{%ci$O%ci'x%ci(`%ci(q%ci(x%ci!]%ci!^%ci~O$O$oy!]$oy!^$oy~P#B]O$O#cy!]#cy!^#cy~P#B]O!g#vO!]'dq!k'dq~O!]/kO!k(}y~O!Y'fq!]'fq~P#/XOr:pO!g#vO(q'nO~O[:tO!Y:sO~P#/XO!Y:sO~Og(^!R!](^!R~P!0{Oa%[y!_%[y'y%[y!]%[y~P#/XO!]0}O!^)Wy~O!]5kO!^)Tq~O(S:zO~O!_1gO%i:}O~O!k;QO~O%i;VO~P&7ZOP$|qR$|q[$|qj$|qr$|q!S$|q!l$|q!p$|q#R$|q#n$|q#o$|q#p$|q#q$|q#r$|q#s$|q#t$|q#u$|q#v$|q#x$|q#z$|q#{$|q$O$|q(`$|q(q$|q!]$|q!^$|q~P'%zO!Q)|O'x)}O(y%POP'iaR'ia['iaj'ian'iar'ia!S'ia!l'ia!p'ia#R'ia#n'ia#o'ia#p'ia#q'ia#r'ia#s'ia#t'ia#u'ia#v'ia#x'ia#z'ia#{'ia$O'ia(`'ia(q'ia(x'ia!]'ia!^'ia~O!Q)|O'x)}OP'kaR'ka['kaj'kan'kar'ka!S'ka!l'ka!p'ka#R'ka#n'ka#o'ka#p'ka#q'ka#r'ka#s'ka#t'ka#u'ka#v'ka#x'ka#z'ka#{'ka$O'ka(`'ka(q'ka(x'ka(y'ka!]'ka!^'ka~OP%OqR%Oq[%Oqj%Oqr%Oq!S%Oq!l%Oq!p%Oq#R%Oq#n%Oq#o%Oq#p%Oq#q%Oq#r%Oq#s%Oq#t%Oq#u%Oq#v%Oq#x%Oq#z%Oq#{%Oq$O%Oq(`%Oq(q%Oq!]%Oq!^%Oq~P'%zOg%e!Z!]%e!Z#`%e!Z$O%e!Z~P!0{O!Y;ZO~P#/XOr;[O!g#vO(q'nO~O[;^O!Y;ZO~P#/XO!]'oq!^'oq~P#B]O!]#h!Z!^#h!Z~P#B]O#k%e!ZP%e!ZR%e!Z[%e!Za%e!Zj%e!Zr%e!Z!S%e!Z!]%e!Z!l%e!Z!p%e!Z#R%e!Z#n%e!Z#o%e!Z#p%e!Z#q%e!Z#r%e!Z#s%e!Z#t%e!Z#u%e!Z#v%e!Z#x%e!Z#z%e!Z#{%e!Z'y%e!Z(`%e!Z(q%e!Z!k%e!Z!Y%e!Z'v%e!Z#`%e!Zv%e!Z!_%e!Z%i%e!Z!g%e!Z~P#/XOr;fO!g#vO(q'nO~O!Y;gO~P#/XOr;nO!g#vO(q'nO~O!Y;oO~P#/XOP%e!ZR%e!Z[%e!Zj%e!Zr%e!Z!S%e!Z!l%e!Z!p%e!Z#R%e!Z#n%e!Z#o%e!Z#p%e!Z#q%e!Z#r%e!Z#s%e!Z#t%e!Z#u%e!Z#v%e!Z#x%e!Z#z%e!Z#{%e!Z$O%e!Z(`%e!Z(q%e!Z!]%e!Z!^%e!Z~P'%zOr;rO!g#vO(q'nO~Ov(eX~P1qO!Q%qO~P!)PO(T!lO~P!)PO!YfX!]fX#`fX~P%0kOP]XR]X[]Xj]Xr]X!Q]X!S]X!]]X!]fX!l]X!p]X#R]X#S]X#`]X#`fX#kfX#n]X#o]X#p]X#q]X#r]X#s]X#t]X#u]X#v]X#x]X#z]X#{]X$Q]X(`]X(q]X(x]X(y]X~O!gfX!k]X!kfX(qfX~P'JsOP;vOQ;vOSfOd=rOe!iOpkOr;vOskOtkOzkO|;vO!O;vO!SWO!WkO!XkO!_XO!i;yO!lZO!o;vO!p;vO!q;vO!s;zO!u;}O!x!hO$W!kO$n=pO(S)ZO(UTO(XUO(`VO(n[O~O!]<ZO!^$qa~Oh%VOp%WOr%XOs$tOt$tOz%YO|%ZO!O<fO!S${O!_$|O!i=wO!l$xO#j<lO$W%_O$t<hO$v<jO$y%`O(S(tO(UTO(XUO(`$uO(x$}O(y%PO~Ol)bO~P( iOr!eX(q!eX~P# }Or(iX(q(iX~P#!pO!^]X!^fX~P'JsO!YfX!Y$zX!]fX!]$zX#`fX~P!/wO#k<OO~O!g#vO#k<OO~O#`<`O~Oj<SO~O#`<pO!](vX!^(vX~O#`<`O!](tX!^(tX~O#k<qO~Og<sO~P!0{O#k<yO~O#k<zO~O!g#vO#k<{O~O!g#vO#k<qO~O$O<|O~P#B]O#k<}O~O#k=OO~O#k=TO~O#k=UO~O#k=VO~O#k=WO~O$O=XO~P!0{O$O=YO~P!0{Ok#S#T#U#W#X#[#i#j#u$n$t$v$y%]%^%h%i%j%q%s%v%w%y%{~'}T#o!X'{(T#ps#n#qr!Q'|$]'|(S$_(d~",
      goto: "$8g)[PPPPPP)]PP)`P)qP+R/WPPPP6bPP6xPP<pPPP@dP@zP@zPPP@zPCSP@zP@zP@zPCWPC]PCzPHtPPPHxPPPPHxK{PPPLRLsPHxPHxPP! RHxPPPHxPHxP!#YHxP!&p!'u!(OP!(r!(v!(r!,TPPPPPPP!,t!'uPP!-U!.vP!2SHxHx!2X!5e!:R!:R!>QPPP!>YHxPPPPPPPPP!AiP!BvPPHx!DXPHxPHxHxHxHxHxPHx!EkP!HuP!K{P!LP!LZ!L_!L_P!HrP!Lc!LcP# iP# mHxPHx# s#$xCW@zP@zP@z@zP#&V@z@z#(i@z#+a@z#-m@z@z#.]#0q#0q#0v#1P#0q#1[PP#0qP@z#1t@z#5s@z@z6bPPP#9xPPP#:c#:cP#:cP#:y#:cPP#;PP#:vP#:v#;d#:v#<O#<U#<X)`#<[)`P#<c#<c#<cP)`P)`P)`P)`PP)`P#<i#<lP#<l)`P#<pP#<sP)`P)`P)`P)`P)`P)`)`PP#<y#=P#=[#=b#=h#=n#=t#>S#>Y#>d#>j#>t#>z#?[#?b#@S#@f#@l#@r#AQ#Ag#C[#Cj#Cq#E]#Ek#G]#Gk#Gq#Gw#G}#HX#H_#He#Ho#IR#IXPPPPPPPPPPP#I_PPPPPPP#JS#MZ#Ns#Nz$ SPPP$&nP$&w$)p$0Z$0^$0a$1`$1c$1j$1rP$1x$1{P$2i$2m$3e$4s$4x$5`PP$5e$5k$5o$5r$5v$5z$6v$7_$7v$7z$7}$8Q$8W$8Z$8_$8cR!|RoqOXst!Z#d%l&p&r&s&u,n,s2S2VY!vQ'^-`1g5qQ%svQ%{yQ&S|Q&h!VS'U!e-WQ'd!iS'j!r!yU*h$|*X*lQ+l%|Q+y&UQ,_&bQ-^']Q-h'eQ-p'kQ0U*nQ1q,`R<m;z%SdOPWXYZstuvw!Z!`!g!o#S#W#Z#d#o#u#x#{$O$P$Q$R$S$T$U$V$W$X$_$a$e%l%s&Q&i&l&p&r&s&u&y'R'`'p(R(T(Z(b(v(x(|){*f+U+Y,k,n,s-d-l-z.Q.o.v/i0V0d0l0|1j1z1{1}2P2S2V2X2x3O3d4q5y6Z6[6_6r8i8x9SS#q];w!r)]$Z$n'V)q-P-S/Q2h3{5m6i9}:a;v;y;z;}<O<P<Q<R<S<T<U<V<W<X<Y<Z<]<`<m<p<q<s<{<|=V=W=sU*{%[<e<fQ+q&OQ,a&eQ,h&mQ0r+dQ0w+fQ1S+rQ1y,fQ3W.bQ5V0vQ5]0}Q6Q1rQ7O3[Q8U5^R9Y7Q'QkOPWXYZstuvw!Z!`!g!o#S#W#Z#d#o#u#x#{$O$P$Q$R$S$T$U$V$W$X$Z$_$a$e$n%l%s&Q&i&l&m&p&r&s&u&y'R'V'`'p(R(T(Z(b(v(x(|)q){*f+U+Y+d,k,n,s-P-S-d-l-z.Q.b.o.v/Q/i0V0d0l0|1j1z1{1}2P2S2V2X2h2x3O3[3d3{4q5m5y6Z6[6_6i6r7Q8i8x9S9}:a;v;y;z;}<O<P<Q<R<S<T<U<V<W<X<Y<Z<]<`<m<p<q<s<{<|=V=W=s!S!nQ!r!v!y!z$|'U']'^'j'k'l*h*l*n*o-W-^-`-p0U0X1g5q5s%[$ti#v$b$c$d$x${%O%Q%]%^%b)w*P*R*T*W*^*d*t*u+c+f+},Q.a.z/_/h/r/s/u0Y0[0g0h0i1^1a1i3Z4U4V4a4f4w5R5U5x6|7l7v7|8Q8f9V9e9n9t:S:f:t:};V;^<^<_<a<b<c<d<g<h<i<j<k<l<t<u<v<w<y<z<}=O=P=Q=R=S=T=U=X=Y=p=x=y=|=}Q&V|Q'S!eS'Y%h-ZQ+q&OQ,a&eQ0f+OQ1S+rQ1X+xQ1x,eQ1y,fQ5]0}Q5f1ZQ6Q1rQ6T1tQ6U1wQ8U5^Q8X5cQ8q6WQ9|8YQ:Y8nR<o*XrnOXst!V!Z#d%l&g&p&r&s&u,n,s2S2VR,c&i&z^OPXYstuvwz!Z!`!g!j!o#S#d#o#u#x#{$O$P$Q$R$S$T$U$V$W$X$Z$_$a$e$n%l%s&Q&i&l&m&p&r&s&u&y'R'`'p(T(Z(b(v(x(|)q){*f+U+Y+d,k,n,s-P-S-d-l-z.Q.b.o.v/Q/i0V0d0l0|1j1z1{1}2P2S2V2X2h2x3O3[3d3{4q5m5y6Z6[6_6i6r7Q8i8x9S9}:a;v;y;z;}<O<P<Q<R<S<T<U<V<W<X<Y<Z<]<`<m<p<q<s<{<|=V=W=r=s[#]WZ#W#Z'V(R!b%im#h#i#l$x%d%g([(f(g(h*W*[*_+W+X+Z,j-Q.O.U.V.W.Y/h/k2[3S3T4X6h6yQ%vxQ%zyS&P|&UQ&]!TQ'a!hQ'c!iQ(o#sS+k%{%|Q+o&OQ,Y&`Q,^&bS-g'd'eQ.d(pQ0{+lQ1R+rQ1T+sQ1W+wQ1l,ZS1p,_,`Q2t-hQ5[0}Q5`1QQ5e1YQ6P1qQ8T5^Q8W5bQ9x8SR:w9y!U$zi$d%O%Q%]%^%b*P*R*^*t*u.z/r0Y0[0g0h0i4V4w7|9e=p=x=y!^%xy!i!u%z%{%|'T'c'd'e'i's*g+k+l-T-g-h-o/{0O0{2m2t2{4i4j4m7s9pQ+e%vQ,O&YQ,R&ZQ,]&bQ.c(oQ1k,YU1o,^,_,`Q3].dQ5z1lS6O1p1qQ8m6P#f=t#v$b$c$x${)w*T*W*d+c+f+},Q.a/_/h/s/u1^1a1i3Z4U4a4f5R5U5x6|7l7v8Q8f9V9n9t:S:f:t:};V;^<a<c<g<i<k<t<v<y<}=P=R=T=X=|=}o=u<^<_<b<d<h<j<l<u<w<z=O=Q=S=U=YW%Ti%V*v=pS&Y!Q&gQ&Z!RQ&[!SQ+S%cR+|&W%]%Si#v$b$c$d$x${%O%Q%]%^%b)w*P*R*T*W*^*d*t*u+c+f+},Q.a.z/_/h/r/s/u0Y0[0g0h0i1^1a1i3Z4U4V4a4f4w5R5U5x6|7l7v7|8Q8f9V9e9n9t:S:f:t:};V;^<^<_<a<b<c<d<g<h<i<j<k<l<t<u<v<w<y<z<}=O=P=Q=R=S=T=U=X=Y=p=x=y=|=}T)x$u)yV*{%[<e<fW'Y!e%h*X-ZS({#y#zQ+`%qQ+v&RS.](k(lQ1b,SQ4x0cR8^5k'QkOPWXYZstuvw!Z!`!g!o#S#W#Z#d#o#u#x#{$O$P$Q$R$S$T$U$V$W$X$Z$_$a$e$n%l%s&Q&i&l&m&p&r&s&u&y'R'V'`'p(R(T(Z(b(v(x(|)q){*f+U+Y+d,k,n,s-P-S-d-l-z.Q.b.o.v/Q/i0V0d0l0|1j1z1{1}2P2S2V2X2h2x3O3[3d3{4q5m5y6Z6[6_6i6r7Q8i8x9S9}:a;v;y;z;}<O<P<Q<R<S<T<U<V<W<X<Y<Z<]<`<m<p<q<s<{<|=V=W=s$i$^c#Y#e%p%r%t(Q(W(r(w)P)Q)R)S)T)U)V)W)X)Y)[)^)`)e)o+a+u-U-s-x-}.P.n.q.u.w.x.y/]0j2c2f2v2}3c3h3i3j3k3l3m3n3o3p3q3r3s3t3w3x4P5O5Y6k6q6v7V7W7a7b8`8|9Q9[9b9c:c:y;R;x=gT#TV#U'RkOPWXYZstuvw!Z!`!g!o#S#W#Z#d#o#u#x#{$O$P$Q$R$S$T$U$V$W$X$Z$_$a$e$n%l%s&Q&i&l&m&p&r&s&u&y'R'V'`'p(R(T(Z(b(v(x(|)q){*f+U+Y+d,k,n,s-P-S-d-l-z.Q.b.o.v/Q/i0V0d0l0|1j1z1{1}2P2S2V2X2h2x3O3[3d3{4q5m5y6Z6[6_6i6r7Q8i8x9S9}:a;v;y;z;}<O<P<Q<R<S<T<U<V<W<X<Y<Z<]<`<m<p<q<s<{<|=V=W=sQ'W!eR2i-W!W!nQ!e!r!v!y!z$|'U']'^'j'k'l*X*h*l*n*o-W-^-`-p0U0X1g5q5sR1d,UnqOXst!Z#d%l&p&r&s&u,n,s2S2VQ&w!^Q't!xS(q#u<OQ+i%yQ,W&]Q,X&_Q-e'bQ-r'mS.m(v<qS0k+U<{Q0y+jQ1f,VQ2Z,uQ2],vQ2e-RQ2r-fQ2u-jS5P0l=VQ5W0zS5Z0|=WQ6j2gQ6n2sQ6s2zQ8R5XQ8}6lQ9O6oQ9R6tR:`8z$d$]c#Y#e%r%t(Q(W(r(w)P)Q)R)S)T)U)V)W)X)Y)[)^)`)e)o+a+u-U-s-x-}.P.n.q.u.x.y/]0j2c2f2v2}3c3h3i3j3k3l3m3n3o3p3q3r3s3t3w3x4P5O5Y6k6q6v7V7W7a7b8`8|9Q9[9b9c:c:y;R;x=gS(m#p'gQ(}#zS+_%p.wS.^(l(nR3U._'QkOPWXYZstuvw!Z!`!g!o#S#W#Z#d#o#u#x#{$O$P$Q$R$S$T$U$V$W$X$Z$_$a$e$n%l%s&Q&i&l&m&p&r&s&u&y'R'V'`'p(R(T(Z(b(v(x(|)q){*f+U+Y+d,k,n,s-P-S-d-l-z.Q.b.o.v/Q/i0V0d0l0|1j1z1{1}2P2S2V2X2h2x3O3[3d3{4q5m5y6Z6[6_6i6r7Q8i8x9S9}:a;v;y;z;}<O<P<Q<R<S<T<U<V<W<X<Y<Z<]<`<m<p<q<s<{<|=V=W=sS#q];wQ&r!XQ&s!YQ&u![Q&v!]R2R,qQ'_!hQ+b%vQ-c'aS.`(o+eQ2p-bW3Y.c.d0q0sQ6m2qW6z3V3X3]5TU9U6{6}7PU:e9W9X9ZS;T:d:gQ;b;UR;j;cU!wQ'^-`T5o1g5q!Q_OXZ`st!V!Z#d#h%d%l&g&i&p&r&s&u(h,n,s.V2S2V]!pQ!r'^-`1g5qT#q];w%^{OPWXYZstuvw!Z!`!g!o#S#W#Z#d#o#u#x#{$O$P$Q$R$S$T$U$V$W$X$_$a$e%l%s&Q&i&l&m&p&r&s&u&y'R'`'p(R(T(Z(b(v(x(|){*f+U+Y+d,k,n,s-d-l-z.Q.b.o.v/i0V0d0l0|1j1z1{1}2P2S2V2X2x3O3[3d4q5y6Z6[6_6r7Q8i8x9SS({#y#zS.](k(l!s=^$Z$n'V)q-P-S/Q2h3{5m6i9}:a;v;y;z;}<O<P<Q<R<S<T<U<V<W<X<Y<Z<]<`<m<p<q<s<{<|=V=W=sU$fd)],hS(n#p'gU*s%R(u3vU0e*z.i7]Q5T0rQ6{3WQ9X7OR:g9Ym!tQ!r!v!y!z'^'j'k'l-`-p1g5q5sQ'r!uS(d#g1|S-n'i'uQ/n*ZQ/{*gQ2|-qQ4]/oQ4i/}Q4j0OQ4o0WQ7h4WS7s4k4mS7w4p4rQ9g7iQ9k7oQ9p7tQ9u7yS:o9l9mS;Y:p:sS;e;Z;[S;m;f;gS;q;n;oR;t;rQ#wbQ'q!uS(c#g1|S(e#m+TQ+V%eQ+g%wQ+m%}U-m'i'r'uQ.R(dQ/m*ZQ/|*gQ0P*iQ0x+hQ1m,[S2y-n-qQ3R.ZS4[/n/oQ4e/yS4h/{0WQ4l0QQ5|1nQ6u2|Q7g4WQ7k4]U7r4i4o4rQ7u4nQ8k5}S9f7h7iQ9j7oQ9r7wQ9s7xQ:V8lQ:m9gS:n9k9mQ:v9uQ;P:WS;X:o:sS;d;Y;ZS;l;e;gS;p;m;oQ;s;qQ;u;tQ=a=[Q=l=eR=m=fV!wQ'^-`%^aOPWXYZstuvw!Z!`!g!o#S#W#Z#d#o#u#x#{$O$P$Q$R$S$T$U$V$W$X$_$a$e%l%s&Q&i&l&m&p&r&s&u&y'R'`'p(R(T(Z(b(v(x(|){*f+U+Y+d,k,n,s-d-l-z.Q.b.o.v/i0V0d0l0|1j1z1{1}2P2S2V2X2x3O3[3d4q5y6Z6[6_6r7Q8i8x9SS#wz!j!r=Z$Z$n'V)q-P-S/Q2h3{5m6i9}:a;v;y;z;}<O<P<Q<R<S<T<U<V<W<X<Y<Z<]<`<m<p<q<s<{<|=V=W=sR=a=r%^bOPWXYZstuvw!Z!`!g!o#S#W#Z#d#o#u#x#{$O$P$Q$R$S$T$U$V$W$X$_$a$e%l%s&Q&i&l&m&p&r&s&u&y'R'`'p(R(T(Z(b(v(x(|){*f+U+Y+d,k,n,s-d-l-z.Q.b.o.v/i0V0d0l0|1j1z1{1}2P2S2V2X2x3O3[3d4q5y6Z6[6_6r7Q8i8x9SQ%ej!^%wy!i!u%z%{%|'T'c'd'e'i's*g+k+l-T-g-h-o/{0O0{2m2t2{4i4j4m7s9pS%}z!jQ+h%xQ,[&bW1n,],^,_,`U5}1o1p1qS8l6O6PQ:W8m!r=[$Z$n'V)q-P-S/Q2h3{5m6i9}:a;v;y;z;}<O<P<Q<R<S<T<U<V<W<X<Y<Z<]<`<m<p<q<s<{<|=V=W=sQ=e=qR=f=r%QeOPXYstuvw!Z!`!g!o#S#d#o#u#x#{$O$P$Q$R$S$T$U$V$W$X$_$a$e%l%s&Q&i&l&p&r&s&u&y'R'`'p(T(Z(b(v(x(|){*f+U+Y+d,k,n,s-d-l-z.Q.b.o.v/i0V0d0l0|1j1z1{1}2P2S2V2X2x3O3[3d4q5y6Z6[6_6r7Q8i8x9SY#bWZ#W#Z(R!b%im#h#i#l$x%d%g([(f(g(h*W*[*_+W+X+Z,j-Q.O.U.V.W.Y/h/k2[3S3T4X6h6yQ,i&m!p=]$Z$n)q-P-S/Q2h3{5m6i9}:a;v;y;z;}<O<P<Q<R<S<T<U<V<W<X<Y<Z<]<`<m<p<q<s<{<|=V=W=sR=`'VU'Z!e%h*XR2k-Z%SdOPWXYZstuvw!Z!`!g!o#S#W#Z#d#o#u#x#{$O$P$Q$R$S$T$U$V$W$X$_$a$e%l%s&Q&i&l&p&r&s&u&y'R'`'p(R(T(Z(b(v(x(|){*f+U+Y,k,n,s-d-l-z.Q.o.v/i0V0d0l0|1j1z1{1}2P2S2V2X2x3O3d4q5y6Z6[6_6r8i8x9S!r)]$Z$n'V)q-P-S/Q2h3{5m6i9}:a;v;y;z;}<O<P<Q<R<S<T<U<V<W<X<Y<Z<]<`<m<p<q<s<{<|=V=W=sQ,h&mQ0r+dQ3W.bQ7O3[R9Y7Q!b$Tc#Y%p(Q(W(r(w)X)Y)^)e+u-s-x-}.P.n.q/]0j2v2}3c3s5O5Y6q6v7V9Q:c;x!P<U)[)o-U.w2c2f3h3q3r3w4P6k7W7a7b8`8|9[9b9c:y;R=g!f$Vc#Y%p(Q(W(r(w)U)V)X)Y)^)e+u-s-x-}.P.n.q/]0j2v2}3c3s5O5Y6q6v7V9Q:c;x!T<W)[)o-U.w2c2f3h3n3o3q3r3w4P6k7W7a7b8`8|9[9b9c:y;R=g!^$Zc#Y%p(Q(W(r(w)^)e+u-s-x-}.P.n.q/]0j2v2}3c3s5O5Y6q6v7V9Q:c;xQ4V/fz=s)[)o-U.w2c2f3h3w4P6k7W7a7b8`8|9[9b9c:y;R=gQ=x=zR=y={'QkOPWXYZstuvw!Z!`!g!o#S#W#Z#d#o#u#x#{$O$P$Q$R$S$T$U$V$W$X$Z$_$a$e$n%l%s&Q&i&l&m&p&r&s&u&y'R'V'`'p(R(T(Z(b(v(x(|)q){*f+U+Y+d,k,n,s-P-S-d-l-z.Q.b.o.v/Q/i0V0d0l0|1j1z1{1}2P2S2V2X2h2x3O3[3d3{4q5m5y6Z6[6_6i6r7Q8i8x9S9}:a;v;y;z;}<O<P<Q<R<S<T<U<V<W<X<Y<Z<]<`<m<p<q<s<{<|=V=W=sS$oh$pR3|/P'XgOPWXYZhstuvw!Z!`!g!o#S#W#Z#d#o#u#x#{$O$P$Q$R$S$T$U$V$W$X$Z$_$a$e$n$p%l%s&Q&i&l&m&p&r&s&u&y'R'V'`'p(R(T(Z(b(v(x(|)q){*f+U+Y+d,k,n,s-P-S-d-l-z.Q.b.o.v/P/Q/i0V0d0l0|1j1z1{1}2P2S2V2X2h2x3O3[3d3{4q5m5y6Z6[6_6i6r7Q8i8x9S9}:a;v;y;z;}<O<P<Q<R<S<T<U<V<W<X<Y<Z<]<`<m<p<q<s<{<|=V=W=sT$kf$qQ$ifS)h$l)lR)t$qT$jf$qT)j$l)l'XhOPWXYZhstuvw!Z!`!g!o#S#W#Z#d#o#u#x#{$O$P$Q$R$S$T$U$V$W$X$Z$_$a$e$n$p%l%s&Q&i&l&m&p&r&s&u&y'R'V'`'p(R(T(Z(b(v(x(|)q){*f+U+Y+d,k,n,s-P-S-d-l-z.Q.b.o.v/P/Q/i0V0d0l0|1j1z1{1}2P2S2V2X2h2x3O3[3d3{4q5m5y6Z6[6_6i6r7Q8i8x9S9}:a;v;y;z;}<O<P<Q<R<S<T<U<V<W<X<Y<Z<]<`<m<p<q<s<{<|=V=W=sT$oh$pQ$rhR)s$p%^jOPWXYZstuvw!Z!`!g!o#S#W#Z#d#o#u#x#{$O$P$Q$R$S$T$U$V$W$X$_$a$e%l%s&Q&i&l&m&p&r&s&u&y'R'`'p(R(T(Z(b(v(x(|){*f+U+Y+d,k,n,s-d-l-z.Q.b.o.v/i0V0d0l0|1j1z1{1}2P2S2V2X2x3O3[3d4q5y6Z6[6_6r7Q8i8x9S!s=q$Z$n'V)q-P-S/Q2h3{5m6i9}:a;v;y;z;}<O<P<Q<R<S<T<U<V<W<X<Y<Z<]<`<m<p<q<s<{<|=V=W=s#glOPXZst!Z!`!o#S#d#o#{$n%l&i&l&m&p&r&s&u&y'R'`(|)q*f+Y+d,k,n,s-d.b/Q/i0V0d1j1z1{1}2P2S2V2X3[3{4q5y6Z6[6_7Q8i8x!U%Ri$d%O%Q%]%^%b*P*R*^*t*u.z/r0Y0[0g0h0i4V4w7|9e=p=x=y#f(u#v$b$c$x${)w*T*W*d+c+f+},Q.a/_/h/s/u1^1a1i3Z4U4a4f5R5U5x6|7l7v8Q8f9V9n9t:S:f:t:};V;^<a<c<g<i<k<t<v<y<}=P=R=T=X=|=}Q+P%`Q/^)|o3v<^<_<b<d<h<j<l<u<w<z=O=Q=S=U=Y!U$yi$d%O%Q%]%^%b*P*R*^*t*u.z/r0Y0[0g0h0i4V4w7|9e=p=x=yQ*`$zU*i$|*X*lQ+Q%aQ0Q*j#f=c#v$b$c$x${)w*T*W*d+c+f+},Q.a/_/h/s/u1^1a1i3Z4U4a4f5R5U5x6|7l7v8Q8f9V9n9t:S:f:t:};V;^<a<c<g<i<k<t<v<y<}=P=R=T=X=|=}n=d<^<_<b<d<h<j<l<u<w<z=O=Q=S=U=YQ=h=tQ=i=uQ=j=vR=k=w!U%Ri$d%O%Q%]%^%b*P*R*^*t*u.z/r0Y0[0g0h0i4V4w7|9e=p=x=y#f(u#v$b$c$x${)w*T*W*d+c+f+},Q.a/_/h/s/u1^1a1i3Z4U4a4f5R5U5x6|7l7v8Q8f9V9n9t:S:f:t:};V;^<a<c<g<i<k<t<v<y<}=P=R=T=X=|=}o3v<^<_<b<d<h<j<l<u<w<z=O=Q=S=U=YnoOXst!Z#d%l&p&r&s&u,n,s2S2VS*c${*WQ,|&|Q,}'OR4`/s%[%Si#v$b$c$d$x${%O%Q%]%^%b)w*P*R*T*W*^*d*t*u+c+f+},Q.a.z/_/h/r/s/u0Y0[0g0h0i1^1a1i3Z4U4V4a4f4w5R5U5x6|7l7v7|8Q8f9V9e9n9t:S:f:t:};V;^<^<_<a<b<c<d<g<h<i<j<k<l<t<u<v<w<y<z<}=O=P=Q=R=S=T=U=X=Y=p=x=y=|=}Q,P&ZQ1`,RQ5i1_R8]5jV*k$|*X*lU*k$|*X*lT5p1g5qS/y*f/iQ4n0VT7x4q:PQ+g%wQ0P*iQ0x+hQ1m,[Q5|1nQ8k5}Q:V8lR;P:W!U%Oi$d%O%Q%]%^%b*P*R*^*t*u.z/r0Y0[0g0h0i4V4w7|9e=p=x=yx*P$v)c*Q*r+R/q0^0_3y4^4{4|4}7f7z9v:l=b=n=oS0Y*q0Z#f<a#v$b$c$x${)w*T*W*d+c+f+},Q.a/_/h/s/u1^1a1i3Z4U4a4f5R5U5x6|7l7v8Q8f9V9n9t:S:f:t:};V;^<a<c<g<i<k<t<v<y<}=P=R=T=X=|=}n<b<^<_<b<d<h<j<l<u<w<z=O=Q=S=U=Y!d<t(s)a*Y*b.e.h.l/Y/f/v0p1]3`4S4_4c5h7R7U7m7p7}8P9i9q9w:q:u;W;];h=z={`<u3u7X7[7`9]:h:k;kS=P.g3aT=Q7Z9`!U%Qi$d%O%Q%]%^%b*P*R*^*t*u.z/r0Y0[0g0h0i4V4w7|9e=p=x=y|*R$v)c*S*q+R/b/q0^0_3y4^4s4{4|4}7f7z9v:l=b=n=oS0[*r0]#f<c#v$b$c$x${)w*T*W*d+c+f+},Q.a/_/h/s/u1^1a1i3Z4U4a4f5R5U5x6|7l7v8Q8f9V9n9t:S:f:t:};V;^<a<c<g<i<k<t<v<y<}=P=R=T=X=|=}n<d<^<_<b<d<h<j<l<u<w<z=O=Q=S=U=Y!h<v(s)a*Y*b.f.g.l/Y/f/v0p1]3^3`4S4_4c5h7R7S7U7m7p7}8P9i9q9w:q:u;W;];h=z={d<w3u7Y7Z7`9]9^:h:i:k;kS=R.h3bT=S7[9arnOXst!V!Z#d%l&g&p&r&s&u,n,s2S2VQ&d!UR,k&mrnOXst!V!Z#d%l&g&p&r&s&u,n,s2S2VR&d!UQ,T&[R1[+|snOXst!V!Z#d%l&g&p&r&s&u,n,s2S2VQ1h,YS5w1k1lU8e5u5v5zS:R8g8hS:{:Q:TQ;_:|R;i;`Q&k!VR,d&gR6T1tR:Y8nS&P|&UR1T+sQ&p!WR,n&qR,t&vT2T,s2VR,x&wQ,w&wR2^,xQ'w!{R-t'wSsOtQ#dXT%os#dQ#OTR'y#OQ#RUR'{#RQ)y$uR/Z)yQ#UVR(O#UQ#XWU(U#X(V-{Q(V#YR-{(WQ-X'WR2j-XQ.p(wS3e.p3fR3f.qQ-`'^R2n-`Y!rQ'^-`1g5qR'h!rQ.{)cR3z.{U#_W%g*WU(]#_(^-|Q(^#`R-|(XQ-['ZR2l-[t`OXst!V!Z#d%l&g&i&p&r&s&u,n,s2S2VS#hZ%dU#r`#h.VR.V(hQ(i#jQ.S(eW.[(i.S3P6wQ3P.TR6w3QQ)l$lR/R)lQ$phR)r$pQ$`cU)_$`-w<[Q-w;xR<[)oQ/l*ZW4Y/l4Z7j9hU4Z/m/n/oS7j4[4]R9h7k$e*O$v(s)a)c*Y*b*q*r*|*}+R.g.h.j.k.l/Y/b/d/f/q/v0^0_0p1]3^3_3`3u3y4S4^4_4c4s4u4{4|4}5h7R7S7T7U7Z7[7^7_7`7f7m7p7z7}8P9]9^9_9i9q9v9w:h:i:j:k:l:q:u;W;];h;k=b=n=o=z={Q/t*bU4b/t4d7nQ4d/vR7n4cS*l$|*XR0S*lx*Q$v)c*q*r+R/q0^0_3y4^4{4|4}7f7z9v:l=b=n=o!d.e(s)a*Y*b.g.h.l/Y/f/v0p1]3`4S4_4c5h7R7U7m7p7}8P9i9q9w:q:u;W;];h=z={U/c*Q.e7Xa7X3u7Z7[7`9]:h:k;kQ0Z*qQ3a.gU4t0Z3a9`R9`7Z|*S$v)c*q*r+R/b/q0^0_3y4^4s4{4|4}7f7z9v:l=b=n=o!h.f(s)a*Y*b.g.h.l/Y/f/v0p1]3^3`4S4_4c5h7R7S7U7m7p7}8P9i9q9w:q:u;W;];h=z={U/e*S.f7Ye7Y3u7Z7[7`9]9^:h:i:k;kQ0]*rQ3b.hU4v0]3b9aR9a7[Q*w%UR0a*wQ5S0pR8O5SQ+[%jR0o+[Q5l1bS8_5l:OR:O8`Q,V&]R1e,VQ5q1gR8b5qQ1s,aS6R1s8oR8o6TQ1O+oW5_1O5a8V9zQ5a1RQ8V5`R9z8WQ+t&PR1U+tQ2V,sR6c2VYrOXst#dQ&t!ZQ+^%lQ,m&pQ,o&rQ,p&sQ,r&uQ2Q,nS2T,s2VR6b2SQ%npQ&x!_Q&{!aQ&}!bQ'P!cQ'o!uQ+]%kQ+i%yQ+{&VQ,c&kQ,z&zW-k'i'q'r'uQ-r'mQ0R*kQ0y+jS1v,d,gQ2_,yQ2`,|Q2a,}Q2u-jW2w-m-n-q-sQ5W0zQ5d1XQ5g1]Q5{1mQ6V1xQ6a2RU6p2v2y2|Q6s2zQ8R5XQ8Z5fQ8[5hQ8a5pQ8j5|Q8p6US9P6q6uQ9R6tQ9{8XQ:U8kQ:Z8qQ:b9QQ:x9|Q;O:VQ;S:cR;a;PQ%yyQ'b!iQ'm!uU+j%z%{%|Q-R'TU-f'c'd'eS-j'i'sQ/z*gS0z+k+lQ2g-TS2s-g-hQ2z-oS4g/{0OQ5X0{Q6l2mQ6o2tQ6t2{U7q4i4j4mQ9o7sR:r9pS$wi=pR*x%VU%Ui%V=pR0`*vQ$viS(s#v+fS)a$b$cQ)c$dQ*Y$xS*b${*WQ*q%OQ*r%QQ*|%]Q*}%^Q+R%bQ.g<aQ.h<cQ.j<gQ.k<iQ.l<kQ/Y)wQ/b*PQ/d*RQ/f*TQ/q*^S/v*d/hQ0^*tQ0_*ul0p+c,Q.a1a1i3Z5x6|8f9V:S:f:};VQ1]+}Q3^<tQ3_<vQ3`<yS3u<^<_Q3y.zS4S/_4UQ4^/rQ4_/sQ4c/uQ4s0YQ4u0[Q4{0gQ4|0hQ4}0iQ5h1^Q7R<}Q7S=PQ7T=RQ7U=TQ7Z<bQ7[<dQ7^<hQ7_<jQ7`<lQ7f4VQ7m4aQ7p4fQ7z4wQ7}5RQ8P5UQ9]<zQ9^<uQ9_<wQ9i7lQ9q7vQ9v7|Q9w8QQ:h=OQ:i=QQ:j=SQ:k=UQ:l9eQ:q9nQ:u9tQ;W=XQ;]:tQ;h;^Q;k=YQ=b=pQ=n=xQ=o=yQ=z=|R={=}Q*z%[Q.i<eR7]<fnpOXst!Z#d%l&p&r&s&u,n,s2S2VQ!fPS#fZ#oQ&z!`W'f!o*f0V4qQ'}#SQ)O#{Q)p$nS,g&i&lQ,l&mQ,y&yS-O'R/iQ-b'`Q.s(|Q/V)qQ0m+YQ0s+dQ2O,kQ2q-dQ3X.bQ4O/QQ4y0dQ5v1jQ6X1zQ6Y1{Q6^1}Q6`2PQ6e2XQ7P3[Q7c3{Q8h5yQ8t6ZQ8u6[Q8w6_Q9Z7QQ:T8iR:_8x#[cOPXZst!Z!`!o#d#o#{%l&i&l&m&p&r&s&u&y'R'`(|*f+Y+d,k,n,s-d.b/i0V0d1j1z1{1}2P2S2V2X3[4q5y6Z6[6_7Q8i8xQ#YWQ#eYQ%puQ%rvS%tw!gS(Q#W(TQ(W#ZQ(r#uQ(w#xQ)P$OQ)Q$PQ)R$QQ)S$RQ)T$SQ)U$TQ)V$UQ)W$VQ)X$WQ)Y$XQ)[$ZQ)^$_Q)`$aQ)e$eW)o$n)q/Q3{Q+a%sQ+u&QS-U'V2hQ-s'pS-x(R-zQ-}(ZQ.P(bQ.n(vQ.q(xQ.u;vQ.w;yQ.x;zQ.y;}Q/]){Q0j+UQ2c-PQ2f-SQ2v-lQ2}.QQ3c.oQ3h<OQ3i<PQ3j<QQ3k<RQ3l<SQ3m<TQ3n<UQ3o<VQ3p<WQ3q<XQ3r<YQ3s.vQ3t<]Q3w<`Q3x<mQ4P<ZQ5O0lQ5Y0|Q6k<pQ6q2xQ6v3OQ7V3dQ7W<qQ7a<sQ7b<{Q8`5mQ8|6iQ9Q6rQ9[<|Q9b=VQ9c=WQ:c9SQ:y9}Q;R:aQ;x#SR=g=sR#[WR'X!el!tQ!r!v!y!z'^'j'k'l-`-p1g5q5sS'T!e-WU*g$|*X*lS-T'U']S0O*h*nQ0W*oQ2m-^Q4m0UR4r0XR(y#xQ!fQT-_'^-`]!qQ!r'^-`1g5qQ#p]R'g;wR)d$dY!uQ'^-`1g5qQ'i!rS's!v!yS'u!z5sS-o'j'kQ-q'lR2{-pT#kZ%dS#jZ%dS%jm,jU(e#h#i#lS.T(f(gQ.X(hQ0n+ZQ3Q.UU3R.V.W.YS6x3S3TR9T6yd#^W#W#Z%g(R([*W+W.O/hr#gZm#h#i#l%d(f(g(h+Z.U.V.W.Y3S3T6yS*Z$x*_Q/o*[Q1|,jQ2d-QQ4W/kQ6g2[Q7i4XQ8{6hT=_'V+XV#aW%g*WU#`W%g*WS(S#W([U(X#Z+W/hS-V'V+XT-y(R.OV'[!e%h*XQ$lfR)v$qT)k$l)lR3}/PT*]$x*_T*e${*WQ0q+cQ1_,QQ3V.aQ5j1aQ5u1iQ6}3ZQ8g5xQ9W6|Q:Q8fQ:d9VQ:|:SQ;U:fQ;`:}R;c;VnqOXst!Z#d%l&p&r&s&u,n,s2S2VQ&j!VR,c&gtmOXst!U!V!Z#d%l&g&p&r&s&u,n,s2S2VR,j&mT%km,jR1c,SR,b&eQ&T|R+z&UR+p&OT&n!W&qT&o!W&qT2U,s2V",
      nodeNames: "⚠ ArithOp ArithOp ?. JSXStartTag LineComment BlockComment Script Hashbang ExportDeclaration export Star as VariableName String Escape from ; default FunctionDeclaration async function VariableDefinition > < TypeParamList in out const TypeDefinition extends ThisType this LiteralType ArithOp Number BooleanLiteral TemplateType InterpolationEnd Interpolation InterpolationStart NullType null VoidType void TypeofType typeof MemberExpression . PropertyName [ TemplateString Escape Interpolation super RegExp ] ArrayExpression Spread , } { ObjectExpression Property async get set PropertyDefinition Block : NewTarget new NewExpression ) ( ArgList UnaryExpression delete LogicOp BitOp YieldExpression yield AwaitExpression await ParenthesizedExpression ClassExpression class ClassBody MethodDeclaration Decorator @ MemberExpression PrivatePropertyName CallExpression TypeArgList CompareOp < declare Privacy static abstract override PrivatePropertyDefinition PropertyDeclaration readonly accessor Optional TypeAnnotation Equals StaticBlock FunctionExpression ArrowFunction ParamList ParamList ArrayPattern ObjectPattern PatternProperty Privacy readonly Arrow MemberExpression BinaryExpression ArithOp ArithOp ArithOp ArithOp BitOp CompareOp instanceof satisfies CompareOp BitOp BitOp BitOp LogicOp LogicOp ConditionalExpression LogicOp LogicOp AssignmentExpression UpdateOp PostfixExpression CallExpression InstantiationExpression TaggedTemplateExpression DynamicImport import ImportMeta JSXElement JSXSelfCloseEndTag JSXSelfClosingTag JSXIdentifier JSXBuiltin JSXIdentifier JSXNamespacedName JSXMemberExpression JSXSpreadAttribute JSXAttribute JSXAttributeValue JSXEscape JSXEndTag JSXOpenTag JSXFragmentTag JSXText JSXEscape JSXStartCloseTag JSXCloseTag PrefixCast < ArrowFunction TypeParamList SequenceExpression InstantiationExpression KeyofType keyof UniqueType unique ImportType InferredType infer TypeName ParenthesizedType FunctionSignature ParamList NewSignature IndexedType TupleType Label ArrayType ReadonlyType ObjectType MethodType PropertyType IndexSignature PropertyDefinition CallSignature TypePredicate asserts is NewSignature new UnionType LogicOp IntersectionType LogicOp ConditionalType ParameterizedType ClassDeclaration abstract implements type VariableDeclaration let var using TypeAliasDeclaration InterfaceDeclaration interface EnumDeclaration enum EnumBody NamespaceDeclaration namespace module AmbientDeclaration declare GlobalDeclaration global ClassDeclaration ClassBody AmbientFunctionDeclaration ExportGroup VariableName VariableName ImportDeclaration ImportGroup ForStatement for ForSpec ForInSpec ForOfSpec of WhileStatement while WithStatement with DoStatement do IfStatement if else SwitchStatement switch SwitchBody CaseLabel case DefaultLabel TryStatement try CatchClause catch FinallyClause finally ReturnStatement return ThrowStatement throw BreakStatement break ContinueStatement continue DebuggerStatement debugger LabeledStatement ExpressionStatement SingleExpression SingleClassItem",
      maxTerm: 379,
      context: trackNewline,
      nodeProps: [
        ["isolate", -8,5,6,14,37,39,51,53,55,""],
        ["group", -26,9,17,19,68,207,211,215,216,218,221,224,234,236,242,244,246,248,251,257,263,265,267,269,271,273,274,"Statement",-34,13,14,32,35,36,42,51,54,55,57,62,70,72,76,80,82,84,85,110,111,120,121,136,139,141,142,143,144,145,147,148,167,169,171,"Expression",-23,31,33,37,41,43,45,173,175,177,178,180,181,182,184,185,186,188,189,190,201,203,205,206,"Type",-3,88,103,109,"ClassItem"],
        ["openedBy", 23,"<",38,"InterpolationStart",56,"[",60,"{",73,"(",160,"JSXStartCloseTag"],
        ["closedBy", -2,24,168,">",40,"InterpolationEnd",50,"]",61,"}",74,")",165,"JSXEndTag"]
      ],
      propSources: [jsHighlight],
      skippedNodes: [0,5,6,277],
      repeatNodeCount: 37,
      tokenData: "$Fq07[R!bOX%ZXY+gYZ-yZ[+g[]%Z]^.c^p%Zpq+gqr/mrs3cst:_tuEruvJSvwLkwx! Yxy!'iyz!(sz{!)}{|!,q|}!.O}!O!,q!O!P!/Y!P!Q!9j!Q!R#:O!R![#<_![!]#I_!]!^#Jk!^!_#Ku!_!`$![!`!a$$v!a!b$*T!b!c$,r!c!}Er!}#O$-|#O#P$/W#P#Q$4o#Q#R$5y#R#SEr#S#T$7W#T#o$8b#o#p$<r#p#q$=h#q#r$>x#r#s$@U#s$f%Z$f$g+g$g#BYEr#BY#BZ$A`#BZ$ISEr$IS$I_$A`$I_$I|Er$I|$I}$Dk$I}$JO$Dk$JO$JTEr$JT$JU$A`$JU$KVEr$KV$KW$A`$KW&FUEr&FU&FV$A`&FV;'SEr;'S;=`I|<%l?HTEr?HT?HU$A`?HUOEr(n%d_$i&j(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z&j&hT$i&jO!^&c!_#o&c#p;'S&c;'S;=`&w<%lO&c&j&zP;=`<%l&c'|'U]$i&j(Y!bOY&}YZ&cZw&}wx&cx!^&}!^!_'}!_#O&}#O#P&c#P#o&}#o#p'}#p;'S&};'S;=`(l<%lO&}!b(SU(Y!bOY'}Zw'}x#O'}#P;'S'};'S;=`(f<%lO'}!b(iP;=`<%l'}'|(oP;=`<%l&}'[(y]$i&j(VpOY(rYZ&cZr(rrs&cs!^(r!^!_)r!_#O(r#O#P&c#P#o(r#o#p)r#p;'S(r;'S;=`*a<%lO(rp)wU(VpOY)rZr)rs#O)r#P;'S)r;'S;=`*Z<%lO)rp*^P;=`<%l)r'[*dP;=`<%l(r#S*nX(Vp(Y!bOY*gZr*grs'}sw*gwx)rx#O*g#P;'S*g;'S;=`+Z<%lO*g#S+^P;=`<%l*g(n+dP;=`<%l%Z07[+rq$i&j(Vp(Y!b'{0/lOX%ZXY+gYZ&cZ[+g[p%Zpq+gqr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p$f%Z$f$g+g$g#BY%Z#BY#BZ+g#BZ$IS%Z$IS$I_+g$I_$JT%Z$JT$JU+g$JU$KV%Z$KV$KW+g$KW&FU%Z&FU&FV+g&FV;'S%Z;'S;=`+a<%l?HT%Z?HT?HU+g?HUO%Z07[.ST(W#S$i&j'|0/lO!^&c!_#o&c#p;'S&c;'S;=`&w<%lO&c07[.n_$i&j(Vp(Y!b'|0/lOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z)3p/x`$i&j!p),Q(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_!`0z!`#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z(KW1V`#v(Ch$i&j(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_!`2X!`#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z(KW2d_#v(Ch$i&j(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z'At3l_(U':f$i&j(Y!bOY4kYZ5qZr4krs7nsw4kwx5qx!^4k!^!_8p!_#O4k#O#P5q#P#o4k#o#p8p#p;'S4k;'S;=`:X<%lO4k(^4r_$i&j(Y!bOY4kYZ5qZr4krs7nsw4kwx5qx!^4k!^!_8p!_#O4k#O#P5q#P#o4k#o#p8p#p;'S4k;'S;=`:X<%lO4k&z5vX$i&jOr5qrs6cs!^5q!^!_6y!_#o5q#o#p6y#p;'S5q;'S;=`7h<%lO5q&z6jT$d`$i&jO!^&c!_#o&c#p;'S&c;'S;=`&w<%lO&c`6|TOr6yrs7]s;'S6y;'S;=`7b<%lO6y`7bO$d``7eP;=`<%l6y&z7kP;=`<%l5q(^7w]$d`$i&j(Y!bOY&}YZ&cZw&}wx&cx!^&}!^!_'}!_#O&}#O#P&c#P#o&}#o#p'}#p;'S&};'S;=`(l<%lO&}!r8uZ(Y!bOY8pYZ6yZr8prs9hsw8pwx6yx#O8p#O#P6y#P;'S8p;'S;=`:R<%lO8p!r9oU$d`(Y!bOY'}Zw'}x#O'}#P;'S'};'S;=`(f<%lO'}!r:UP;=`<%l8p(^:[P;=`<%l4k%9[:hh$i&j(Vp(Y!bOY%ZYZ&cZq%Zqr<Srs&}st%ZtuCruw%Zwx(rx!^%Z!^!_*g!_!c%Z!c!}Cr!}#O%Z#O#P&c#P#R%Z#R#SCr#S#T%Z#T#oCr#o#p*g#p$g%Z$g;'SCr;'S;=`El<%lOCr(r<__WS$i&j(Vp(Y!bOY<SYZ&cZr<Srs=^sw<Swx@nx!^<S!^!_Bm!_#O<S#O#P>`#P#o<S#o#pBm#p;'S<S;'S;=`Cl<%lO<S(Q=g]WS$i&j(Y!bOY=^YZ&cZw=^wx>`x!^=^!^!_?q!_#O=^#O#P>`#P#o=^#o#p?q#p;'S=^;'S;=`@h<%lO=^&n>gXWS$i&jOY>`YZ&cZ!^>`!^!_?S!_#o>`#o#p?S#p;'S>`;'S;=`?k<%lO>`S?XSWSOY?SZ;'S?S;'S;=`?e<%lO?SS?hP;=`<%l?S&n?nP;=`<%l>`!f?xWWS(Y!bOY?qZw?qwx?Sx#O?q#O#P?S#P;'S?q;'S;=`@b<%lO?q!f@eP;=`<%l?q(Q@kP;=`<%l=^'`@w]WS$i&j(VpOY@nYZ&cZr@nrs>`s!^@n!^!_Ap!_#O@n#O#P>`#P#o@n#o#pAp#p;'S@n;'S;=`Bg<%lO@ntAwWWS(VpOYApZrAprs?Ss#OAp#O#P?S#P;'SAp;'S;=`Ba<%lOAptBdP;=`<%lAp'`BjP;=`<%l@n#WBvYWS(Vp(Y!bOYBmZrBmrs?qswBmwxApx#OBm#O#P?S#P;'SBm;'S;=`Cf<%lOBm#WCiP;=`<%lBm(rCoP;=`<%l<S%9[C}i$i&j(n%1l(Vp(Y!bOY%ZYZ&cZr%Zrs&}st%ZtuCruw%Zwx(rx!Q%Z!Q![Cr![!^%Z!^!_*g!_!c%Z!c!}Cr!}#O%Z#O#P&c#P#R%Z#R#SCr#S#T%Z#T#oCr#o#p*g#p$g%Z$g;'SCr;'S;=`El<%lOCr%9[EoP;=`<%lCr07[FRk$i&j(Vp(Y!b$]#t(S,2j(d$I[OY%ZYZ&cZr%Zrs&}st%ZtuEruw%Zwx(rx}%Z}!OGv!O!Q%Z!Q![Er![!^%Z!^!_*g!_!c%Z!c!}Er!}#O%Z#O#P&c#P#R%Z#R#SEr#S#T%Z#T#oEr#o#p*g#p$g%Z$g;'SEr;'S;=`I|<%lOEr+dHRk$i&j(Vp(Y!b$]#tOY%ZYZ&cZr%Zrs&}st%ZtuGvuw%Zwx(rx}%Z}!OGv!O!Q%Z!Q![Gv![!^%Z!^!_*g!_!c%Z!c!}Gv!}#O%Z#O#P&c#P#R%Z#R#SGv#S#T%Z#T#oGv#o#p*g#p$g%Z$g;'SGv;'S;=`Iv<%lOGv+dIyP;=`<%lGv07[JPP;=`<%lEr(KWJ_`$i&j(Vp(Y!b#p(ChOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_!`Ka!`#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z(KWKl_$i&j$Q(Ch(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z,#xLva(y+JY$i&j(Vp(Y!bOY%ZYZ&cZr%Zrs&}sv%ZvwM{wx(rx!^%Z!^!_*g!_!`Ka!`#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z(KWNW`$i&j#z(Ch(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_!`Ka!`#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z'At! c_(X';W$i&j(VpOY!!bYZ!#hZr!!brs!#hsw!!bwx!$xx!^!!b!^!_!%z!_#O!!b#O#P!#h#P#o!!b#o#p!%z#p;'S!!b;'S;=`!'c<%lO!!b'l!!i_$i&j(VpOY!!bYZ!#hZr!!brs!#hsw!!bwx!$xx!^!!b!^!_!%z!_#O!!b#O#P!#h#P#o!!b#o#p!%z#p;'S!!b;'S;=`!'c<%lO!!b&z!#mX$i&jOw!#hwx6cx!^!#h!^!_!$Y!_#o!#h#o#p!$Y#p;'S!#h;'S;=`!$r<%lO!#h`!$]TOw!$Ywx7]x;'S!$Y;'S;=`!$l<%lO!$Y`!$oP;=`<%l!$Y&z!$uP;=`<%l!#h'l!%R]$d`$i&j(VpOY(rYZ&cZr(rrs&cs!^(r!^!_)r!_#O(r#O#P&c#P#o(r#o#p)r#p;'S(r;'S;=`*a<%lO(r!Q!&PZ(VpOY!%zYZ!$YZr!%zrs!$Ysw!%zwx!&rx#O!%z#O#P!$Y#P;'S!%z;'S;=`!']<%lO!%z!Q!&yU$d`(VpOY)rZr)rs#O)r#P;'S)r;'S;=`*Z<%lO)r!Q!'`P;=`<%l!%z'l!'fP;=`<%l!!b/5|!'t_!l/.^$i&j(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z#&U!)O_!k!Lf$i&j(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z-!n!*[b$i&j(Vp(Y!b(T%&f#q(ChOY%ZYZ&cZr%Zrs&}sw%Zwx(rxz%Zz{!+d{!^%Z!^!_*g!_!`Ka!`#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z(KW!+o`$i&j(Vp(Y!b#n(ChOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_!`Ka!`#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z+;x!,|`$i&j(Vp(Y!br+4YOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_!`Ka!`#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z,$U!.Z_!]+Jf$i&j(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z07[!/ec$i&j(Vp(Y!b!Q.2^OY%ZYZ&cZr%Zrs&}sw%Zwx(rx!O%Z!O!P!0p!P!Q%Z!Q![!3Y![!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z#%|!0ya$i&j(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!O%Z!O!P!2O!P!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z#%|!2Z_![!L^$i&j(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z'Ad!3eg$i&j(Vp(Y!bs'9tOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!Q%Z!Q![!3Y![!^%Z!^!_*g!_!g%Z!g!h!4|!h#O%Z#O#P&c#P#R%Z#R#S!3Y#S#X%Z#X#Y!4|#Y#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z'Ad!5Vg$i&j(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx{%Z{|!6n|}%Z}!O!6n!O!Q%Z!Q![!8S![!^%Z!^!_*g!_#O%Z#O#P&c#P#R%Z#R#S!8S#S#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z'Ad!6wc$i&j(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!Q%Z!Q![!8S![!^%Z!^!_*g!_#O%Z#O#P&c#P#R%Z#R#S!8S#S#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z'Ad!8_c$i&j(Vp(Y!bs'9tOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!Q%Z!Q![!8S![!^%Z!^!_*g!_#O%Z#O#P&c#P#R%Z#R#S!8S#S#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z07[!9uf$i&j(Vp(Y!b#o(ChOY!;ZYZ&cZr!;Zrs!<nsw!;Zwx!Lcxz!;Zz{#-}{!P!;Z!P!Q#/d!Q!^!;Z!^!_#(i!_!`#7S!`!a#8i!a!}!;Z!}#O#,f#O#P!Dy#P#o!;Z#o#p#(i#p;'S!;Z;'S;=`#-w<%lO!;Z?O!;fb$i&j(Vp(Y!b!X7`OY!;ZYZ&cZr!;Zrs!<nsw!;Zwx!Lcx!P!;Z!P!Q#&`!Q!^!;Z!^!_#(i!_!}!;Z!}#O#,f#O#P!Dy#P#o!;Z#o#p#(i#p;'S!;Z;'S;=`#-w<%lO!;Z>^!<w`$i&j(Y!b!X7`OY!<nYZ&cZw!<nwx!=yx!P!<n!P!Q!Eq!Q!^!<n!^!_!Gr!_!}!<n!}#O!KS#O#P!Dy#P#o!<n#o#p!Gr#p;'S!<n;'S;=`!L]<%lO!<n<z!>Q^$i&j!X7`OY!=yYZ&cZ!P!=y!P!Q!>|!Q!^!=y!^!_!@c!_!}!=y!}#O!CW#O#P!Dy#P#o!=y#o#p!@c#p;'S!=y;'S;=`!Ek<%lO!=y<z!?Td$i&j!X7`O!^&c!_#W&c#W#X!>|#X#Z&c#Z#[!>|#[#]&c#]#^!>|#^#a&c#a#b!>|#b#g&c#g#h!>|#h#i&c#i#j!>|#j#k!>|#k#m&c#m#n!>|#n#o&c#p;'S&c;'S;=`&w<%lO&c7`!@hX!X7`OY!@cZ!P!@c!P!Q!AT!Q!}!@c!}#O!Ar#O#P!Bq#P;'S!@c;'S;=`!CQ<%lO!@c7`!AYW!X7`#W#X!AT#Z#[!AT#]#^!AT#a#b!AT#g#h!AT#i#j!AT#j#k!AT#m#n!AT7`!AuVOY!ArZ#O!Ar#O#P!B[#P#Q!@c#Q;'S!Ar;'S;=`!Bk<%lO!Ar7`!B_SOY!ArZ;'S!Ar;'S;=`!Bk<%lO!Ar7`!BnP;=`<%l!Ar7`!BtSOY!@cZ;'S!@c;'S;=`!CQ<%lO!@c7`!CTP;=`<%l!@c<z!C][$i&jOY!CWYZ&cZ!^!CW!^!_!Ar!_#O!CW#O#P!DR#P#Q!=y#Q#o!CW#o#p!Ar#p;'S!CW;'S;=`!Ds<%lO!CW<z!DWX$i&jOY!CWYZ&cZ!^!CW!^!_!Ar!_#o!CW#o#p!Ar#p;'S!CW;'S;=`!Ds<%lO!CW<z!DvP;=`<%l!CW<z!EOX$i&jOY!=yYZ&cZ!^!=y!^!_!@c!_#o!=y#o#p!@c#p;'S!=y;'S;=`!Ek<%lO!=y<z!EnP;=`<%l!=y>^!Ezl$i&j(Y!b!X7`OY&}YZ&cZw&}wx&cx!^&}!^!_'}!_#O&}#O#P&c#P#W&}#W#X!Eq#X#Z&}#Z#[!Eq#[#]&}#]#^!Eq#^#a&}#a#b!Eq#b#g&}#g#h!Eq#h#i&}#i#j!Eq#j#k!Eq#k#m&}#m#n!Eq#n#o&}#o#p'}#p;'S&};'S;=`(l<%lO&}8r!GyZ(Y!b!X7`OY!GrZw!Grwx!@cx!P!Gr!P!Q!Hl!Q!}!Gr!}#O!JU#O#P!Bq#P;'S!Gr;'S;=`!J|<%lO!Gr8r!Hse(Y!b!X7`OY'}Zw'}x#O'}#P#W'}#W#X!Hl#X#Z'}#Z#[!Hl#[#]'}#]#^!Hl#^#a'}#a#b!Hl#b#g'}#g#h!Hl#h#i'}#i#j!Hl#j#k!Hl#k#m'}#m#n!Hl#n;'S'};'S;=`(f<%lO'}8r!JZX(Y!bOY!JUZw!JUwx!Arx#O!JU#O#P!B[#P#Q!Gr#Q;'S!JU;'S;=`!Jv<%lO!JU8r!JyP;=`<%l!JU8r!KPP;=`<%l!Gr>^!KZ^$i&j(Y!bOY!KSYZ&cZw!KSwx!CWx!^!KS!^!_!JU!_#O!KS#O#P!DR#P#Q!<n#Q#o!KS#o#p!JU#p;'S!KS;'S;=`!LV<%lO!KS>^!LYP;=`<%l!KS>^!L`P;=`<%l!<n=l!Ll`$i&j(Vp!X7`OY!LcYZ&cZr!Lcrs!=ys!P!Lc!P!Q!Mn!Q!^!Lc!^!_# o!_!}!Lc!}#O#%P#O#P!Dy#P#o!Lc#o#p# o#p;'S!Lc;'S;=`#&Y<%lO!Lc=l!Mwl$i&j(Vp!X7`OY(rYZ&cZr(rrs&cs!^(r!^!_)r!_#O(r#O#P&c#P#W(r#W#X!Mn#X#Z(r#Z#[!Mn#[#](r#]#^!Mn#^#a(r#a#b!Mn#b#g(r#g#h!Mn#h#i(r#i#j!Mn#j#k!Mn#k#m(r#m#n!Mn#n#o(r#o#p)r#p;'S(r;'S;=`*a<%lO(r8Q# vZ(Vp!X7`OY# oZr# ors!@cs!P# o!P!Q#!i!Q!}# o!}#O#$R#O#P!Bq#P;'S# o;'S;=`#$y<%lO# o8Q#!pe(Vp!X7`OY)rZr)rs#O)r#P#W)r#W#X#!i#X#Z)r#Z#[#!i#[#])r#]#^#!i#^#a)r#a#b#!i#b#g)r#g#h#!i#h#i)r#i#j#!i#j#k#!i#k#m)r#m#n#!i#n;'S)r;'S;=`*Z<%lO)r8Q#$WX(VpOY#$RZr#$Rrs!Ars#O#$R#O#P!B[#P#Q# o#Q;'S#$R;'S;=`#$s<%lO#$R8Q#$vP;=`<%l#$R8Q#$|P;=`<%l# o=l#%W^$i&j(VpOY#%PYZ&cZr#%Prs!CWs!^#%P!^!_#$R!_#O#%P#O#P!DR#P#Q!Lc#Q#o#%P#o#p#$R#p;'S#%P;'S;=`#&S<%lO#%P=l#&VP;=`<%l#%P=l#&]P;=`<%l!Lc?O#&kn$i&j(Vp(Y!b!X7`OY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#W%Z#W#X#&`#X#Z%Z#Z#[#&`#[#]%Z#]#^#&`#^#a%Z#a#b#&`#b#g%Z#g#h#&`#h#i%Z#i#j#&`#j#k#&`#k#m%Z#m#n#&`#n#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z9d#(r](Vp(Y!b!X7`OY#(iZr#(irs!Grsw#(iwx# ox!P#(i!P!Q#)k!Q!}#(i!}#O#+`#O#P!Bq#P;'S#(i;'S;=`#,`<%lO#(i9d#)th(Vp(Y!b!X7`OY*gZr*grs'}sw*gwx)rx#O*g#P#W*g#W#X#)k#X#Z*g#Z#[#)k#[#]*g#]#^#)k#^#a*g#a#b#)k#b#g*g#g#h#)k#h#i*g#i#j#)k#j#k#)k#k#m*g#m#n#)k#n;'S*g;'S;=`+Z<%lO*g9d#+gZ(Vp(Y!bOY#+`Zr#+`rs!JUsw#+`wx#$Rx#O#+`#O#P!B[#P#Q#(i#Q;'S#+`;'S;=`#,Y<%lO#+`9d#,]P;=`<%l#+`9d#,cP;=`<%l#(i?O#,o`$i&j(Vp(Y!bOY#,fYZ&cZr#,frs!KSsw#,fwx#%Px!^#,f!^!_#+`!_#O#,f#O#P!DR#P#Q!;Z#Q#o#,f#o#p#+`#p;'S#,f;'S;=`#-q<%lO#,f?O#-tP;=`<%l#,f?O#-zP;=`<%l!;Z07[#.[b$i&j(Vp(Y!b'}0/l!X7`OY!;ZYZ&cZr!;Zrs!<nsw!;Zwx!Lcx!P!;Z!P!Q#&`!Q!^!;Z!^!_#(i!_!}!;Z!}#O#,f#O#P!Dy#P#o!;Z#o#p#(i#p;'S!;Z;'S;=`#-w<%lO!;Z07[#/o_$i&j(Vp(Y!bT0/lOY#/dYZ&cZr#/drs#0nsw#/dwx#4Ox!^#/d!^!_#5}!_#O#/d#O#P#1p#P#o#/d#o#p#5}#p;'S#/d;'S;=`#6|<%lO#/d06j#0w]$i&j(Y!bT0/lOY#0nYZ&cZw#0nwx#1px!^#0n!^!_#3R!_#O#0n#O#P#1p#P#o#0n#o#p#3R#p;'S#0n;'S;=`#3x<%lO#0n05W#1wX$i&jT0/lOY#1pYZ&cZ!^#1p!^!_#2d!_#o#1p#o#p#2d#p;'S#1p;'S;=`#2{<%lO#1p0/l#2iST0/lOY#2dZ;'S#2d;'S;=`#2u<%lO#2d0/l#2xP;=`<%l#2d05W#3OP;=`<%l#1p01O#3YW(Y!bT0/lOY#3RZw#3Rwx#2dx#O#3R#O#P#2d#P;'S#3R;'S;=`#3r<%lO#3R01O#3uP;=`<%l#3R06j#3{P;=`<%l#0n05x#4X]$i&j(VpT0/lOY#4OYZ&cZr#4Ors#1ps!^#4O!^!_#5Q!_#O#4O#O#P#1p#P#o#4O#o#p#5Q#p;'S#4O;'S;=`#5w<%lO#4O00^#5XW(VpT0/lOY#5QZr#5Qrs#2ds#O#5Q#O#P#2d#P;'S#5Q;'S;=`#5q<%lO#5Q00^#5tP;=`<%l#5Q05x#5zP;=`<%l#4O01p#6WY(Vp(Y!bT0/lOY#5}Zr#5}rs#3Rsw#5}wx#5Qx#O#5}#O#P#2d#P;'S#5};'S;=`#6v<%lO#5}01p#6yP;=`<%l#5}07[#7PP;=`<%l#/d)3h#7ab$i&j$Q(Ch(Vp(Y!b!X7`OY!;ZYZ&cZr!;Zrs!<nsw!;Zwx!Lcx!P!;Z!P!Q#&`!Q!^!;Z!^!_#(i!_!}!;Z!}#O#,f#O#P!Dy#P#o!;Z#o#p#(i#p;'S!;Z;'S;=`#-w<%lO!;ZAt#8vb$Z#t$i&j(Vp(Y!b!X7`OY!;ZYZ&cZr!;Zrs!<nsw!;Zwx!Lcx!P!;Z!P!Q#&`!Q!^!;Z!^!_#(i!_!}!;Z!}#O#,f#O#P!Dy#P#o!;Z#o#p#(i#p;'S!;Z;'S;=`#-w<%lO!;Z'Ad#:Zp$i&j(Vp(Y!bs'9tOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!O%Z!O!P!3Y!P!Q%Z!Q![#<_![!^%Z!^!_*g!_!g%Z!g!h!4|!h#O%Z#O#P&c#P#R%Z#R#S#<_#S#U%Z#U#V#?i#V#X%Z#X#Y!4|#Y#b%Z#b#c#>_#c#d#Bq#d#l%Z#l#m#Es#m#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z'Ad#<jk$i&j(Vp(Y!bs'9tOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!O%Z!O!P!3Y!P!Q%Z!Q![#<_![!^%Z!^!_*g!_!g%Z!g!h!4|!h#O%Z#O#P&c#P#R%Z#R#S#<_#S#X%Z#X#Y!4|#Y#b%Z#b#c#>_#c#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z'Ad#>j_$i&j(Vp(Y!bs'9tOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z'Ad#?rd$i&j(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!Q%Z!Q!R#AQ!R!S#AQ!S!^%Z!^!_*g!_#O%Z#O#P&c#P#R%Z#R#S#AQ#S#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z'Ad#A]f$i&j(Vp(Y!bs'9tOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!Q%Z!Q!R#AQ!R!S#AQ!S!^%Z!^!_*g!_#O%Z#O#P&c#P#R%Z#R#S#AQ#S#b%Z#b#c#>_#c#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z'Ad#Bzc$i&j(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!Q%Z!Q!Y#DV!Y!^%Z!^!_*g!_#O%Z#O#P&c#P#R%Z#R#S#DV#S#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z'Ad#Dbe$i&j(Vp(Y!bs'9tOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!Q%Z!Q!Y#DV!Y!^%Z!^!_*g!_#O%Z#O#P&c#P#R%Z#R#S#DV#S#b%Z#b#c#>_#c#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z'Ad#E|g$i&j(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!Q%Z!Q![#Ge![!^%Z!^!_*g!_!c%Z!c!i#Ge!i#O%Z#O#P&c#P#R%Z#R#S#Ge#S#T%Z#T#Z#Ge#Z#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z'Ad#Gpi$i&j(Vp(Y!bs'9tOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!Q%Z!Q![#Ge![!^%Z!^!_*g!_!c%Z!c!i#Ge!i#O%Z#O#P&c#P#R%Z#R#S#Ge#S#T%Z#T#Z#Ge#Z#b%Z#b#c#>_#c#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z*)x#Il_!g$b$i&j$O)Lv(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z)[#Jv_al$i&j(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z04f#LS^h#)`#R-<U(Vp(Y!b$n7`OY*gZr*grs'}sw*gwx)rx!P*g!P!Q#MO!Q!^*g!^!_#Mt!_!`$ f!`#O*g#P;'S*g;'S;=`+Z<%lO*g(n#MXX$k&j(Vp(Y!bOY*gZr*grs'}sw*gwx)rx#O*g#P;'S*g;'S;=`+Z<%lO*g(El#M}Z#r(Ch(Vp(Y!bOY*gZr*grs'}sw*gwx)rx!_*g!_!`#Np!`#O*g#P;'S*g;'S;=`+Z<%lO*g(El#NyX$Q(Ch(Vp(Y!bOY*gZr*grs'}sw*gwx)rx#O*g#P;'S*g;'S;=`+Z<%lO*g(El$ oX#s(Ch(Vp(Y!bOY*gZr*grs'}sw*gwx)rx#O*g#P;'S*g;'S;=`+Z<%lO*g*)x$!ga#`*!Y$i&j(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_!`0z!`!a$#l!a#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z(K[$#w_#k(Cl$i&j(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z*)x$%Vag!*r#s(Ch$f#|$i&j(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_!`$&[!`!a$'f!a#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z(KW$&g_#s(Ch$i&j(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z(KW$'qa#r(Ch$i&j(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_!`Ka!`!a$(v!a#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z(KW$)R`#r(Ch$i&j(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_!`Ka!`#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z(Kd$*`a(q(Ct$i&j(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_!a%Z!a!b$+e!b#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z(KW$+p`$i&j#{(Ch(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_!`Ka!`#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z%#`$,}_!|$Ip$i&j(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z04f$.X_!S0,v$i&j(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z(n$/]Z$i&jO!^$0O!^!_$0f!_#i$0O#i#j$0k#j#l$0O#l#m$2^#m#o$0O#o#p$0f#p;'S$0O;'S;=`$4i<%lO$0O(n$0VT_#S$i&jO!^&c!_#o&c#p;'S&c;'S;=`&w<%lO&c#S$0kO_#S(n$0p[$i&jO!Q&c!Q![$1f![!^&c!_!c&c!c!i$1f!i#T&c#T#Z$1f#Z#o&c#o#p$3|#p;'S&c;'S;=`&w<%lO&c(n$1kZ$i&jO!Q&c!Q![$2^![!^&c!_!c&c!c!i$2^!i#T&c#T#Z$2^#Z#o&c#p;'S&c;'S;=`&w<%lO&c(n$2cZ$i&jO!Q&c!Q![$3U![!^&c!_!c&c!c!i$3U!i#T&c#T#Z$3U#Z#o&c#p;'S&c;'S;=`&w<%lO&c(n$3ZZ$i&jO!Q&c!Q![$0O![!^&c!_!c&c!c!i$0O!i#T&c#T#Z$0O#Z#o&c#p;'S&c;'S;=`&w<%lO&c#S$4PR!Q![$4Y!c!i$4Y#T#Z$4Y#S$4]S!Q![$4Y!c!i$4Y#T#Z$4Y#q#r$0f(n$4lP;=`<%l$0O#1[$4z_!Y#)l$i&j(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z(KW$6U`#x(Ch$i&j(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_!`Ka!`#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z+;p$7c_$i&j(Vp(Y!b(`+4QOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z07[$8qk$i&j(Vp(Y!b(S,2j$_#t(d$I[OY%ZYZ&cZr%Zrs&}st%Ztu$8buw%Zwx(rx}%Z}!O$:f!O!Q%Z!Q![$8b![!^%Z!^!_*g!_!c%Z!c!}$8b!}#O%Z#O#P&c#P#R%Z#R#S$8b#S#T%Z#T#o$8b#o#p*g#p$g%Z$g;'S$8b;'S;=`$<l<%lO$8b+d$:qk$i&j(Vp(Y!b$_#tOY%ZYZ&cZr%Zrs&}st%Ztu$:fuw%Zwx(rx}%Z}!O$:f!O!Q%Z!Q![$:f![!^%Z!^!_*g!_!c%Z!c!}$:f!}#O%Z#O#P&c#P#R%Z#R#S$:f#S#T%Z#T#o$:f#o#p*g#p$g%Z$g;'S$:f;'S;=`$<f<%lO$:f+d$<iP;=`<%l$:f07[$<oP;=`<%l$8b#Jf$<{X!_#Hb(Vp(Y!bOY*gZr*grs'}sw*gwx)rx#O*g#P;'S*g;'S;=`+Z<%lO*g,#x$=sa(x+JY$i&j(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_!`Ka!`#O%Z#O#P&c#P#o%Z#o#p*g#p#q$+e#q;'S%Z;'S;=`+a<%lO%Z)>v$?V_!^(CdvBr$i&j(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z?O$@a_!q7`$i&j(Vp(Y!bOY%ZYZ&cZr%Zrs&}sw%Zwx(rx!^%Z!^!_*g!_#O%Z#O#P&c#P#o%Z#o#p*g#p;'S%Z;'S;=`+a<%lO%Z07[$Aq|$i&j(Vp(Y!b'{0/l$]#t(S,2j(d$I[OX%ZXY+gYZ&cZ[+g[p%Zpq+gqr%Zrs&}st%ZtuEruw%Zwx(rx}%Z}!OGv!O!Q%Z!Q![Er![!^%Z!^!_*g!_!c%Z!c!}Er!}#O%Z#O#P&c#P#R%Z#R#SEr#S#T%Z#T#oEr#o#p*g#p$f%Z$f$g+g$g#BYEr#BY#BZ$A`#BZ$ISEr$IS$I_$A`$I_$JTEr$JT$JU$A`$JU$KVEr$KV$KW$A`$KW&FUEr&FU&FV$A`&FV;'SEr;'S;=`I|<%l?HTEr?HT?HU$A`?HUOEr07[$D|k$i&j(Vp(Y!b'|0/l$]#t(S,2j(d$I[OY%ZYZ&cZr%Zrs&}st%ZtuEruw%Zwx(rx}%Z}!OGv!O!Q%Z!Q![Er![!^%Z!^!_*g!_!c%Z!c!}Er!}#O%Z#O#P&c#P#R%Z#R#SEr#S#T%Z#T#oEr#o#p*g#p$g%Z$g;'SEr;'S;=`I|<%lOEr",
      tokenizers: [noSemicolon, noSemicolonType, operatorToken, jsx, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, insertSemicolon, new LocalTokenGroup("$S~RRtu[#O#Pg#S#T#|~_P#o#pb~gOx~~jVO#i!P#i#j!U#j#l!P#l#m!q#m;'S!P;'S;=`#v<%lO!P~!UO!U~~!XS!Q![!e!c!i!e#T#Z!e#o#p#Z~!hR!Q![!q!c!i!q#T#Z!q~!tR!Q![!}!c!i!}#T#Z!}~#QR!Q![!P!c!i!P#T#Z!P~#^R!Q![#g!c!i#g#T#Z#g~#jS!Q![#g!c!i#g#T#Z#g#q#r!P~#yP;=`<%l!P~$RO(b~~", 141, 339), new LocalTokenGroup("j~RQYZXz{^~^O(P~~aP!P!Qd~iO(Q~~", 25, 322)],
      topRules: {"Script":[0,7],"SingleExpression":[1,275],"SingleClassItem":[2,276]},
      dialects: {jsx: 0, ts: 15098},
      dynamicPrecedences: {"80":1,"82":1,"94":1,"169":1,"199":1},
      specialized: [{term: 326, get: (value) => spec_identifier[value] || -1},{term: 342, get: (value) => spec_word[value] || -1},{term: 95, get: (value) => spec_LessThan[value] || -1}],
      tokenPrec: 15124
    });

    exports.parser = parser;

    Object.defineProperty(exports, '__esModule', { value: true });

    return exports;

})({});
