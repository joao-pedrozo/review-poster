class PathEntry {
    prop
    args
}

class Privates {
    root
    path
}

const privates = new WeakMap()

function create(data) {
    const fakeFunction = () => {}
    privates.set(fakeFunction, data)
    return new Proxy(fakeFunction, handler)
}

const handler = {
    get(target, prop) {
        const data = privates.get(target);
        return create({root: data.root, path: [...data.path, {prop}]})
    },

    apply: (target, thisArg, args) => {
        const {root, path} = privates.get(target)
        const {prop} = path[path.length - 1]
        const isFunction = a => typeof a === 'function'
        const indexOfCallback = args.findIndex(isFunction);
        Object.assign(path[path.length - 1], {args, indexOfCallback});

        if (indexOfCallback < 0) {
            return create({root, path: [...path.slice(0, -1), {args: args || [], prop}]})
        }

        (async() => {
            const handle = await root
            const value = await handle.executionContext().evaluate((root, path) => {
                return new Promise((resolve, reject) => {
                    function execStep(object, entry) {
                        if (entry.prop === 'then' && entry.indexOfCallback === 0) {
                            resolve(object);
                            return;
                        }
                        var value = object[entry.prop];
                        if (entry.args && entry.indexOfCallback >= 0) {
                            entry.args[entry.indexOfCallback] = resolve;
                        }
                        return entry.args ? value.apply(object, entry.args) : value;
                    }
        
                    function execPath(subroot, subpath) {
                        return subpath.length ? execPath(execStep(subroot, subpath[0]), subpath.slice(1)) : subroot;
                    }
        
                    execPath(root, path);
                });
            },  handle, path);
    
            args[indexOfCallback](value);    
        })()
    }
}

export function directJSHandle(handle) {
    return create({root: handle instanceof Promise ? handle : Promise.resolve(handle), path: []})
}

export function getWindowHandle(page) {
    return directJSHandle(page.evaluateHandle('window'))
}