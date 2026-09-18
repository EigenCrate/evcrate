declare module 'react' {
  export type ReactNode =
    | ReactElement
    | string
    | number
    | boolean
    | null
    | undefined
    | Iterable<ReactNode>;

  export interface ReactElement<P = any, T extends string | JSXElementConstructor<any> = string | JSXElementConstructor<any>> {
    type: T;
    props: P;
    key: string | number | null;
  }

  export type JSXElementConstructor<P> = (props: P) => ReactElement<any, any> | null;
  export type FC<P = Record<string, unknown>> = (props: P) => ReactElement<any, any> | null;

  export interface CSSProperties {
    [key: string]: string | number | undefined;
  }

  export interface MutableRefObject<T> {
    current: T;
  }

  export type Dispatch<A> = (value: A) => void;
  export type Reducer<S, A> = (prevState: S, action: A) => S;
  export type SetStateAction<S> = S | ((prevState: S) => S);

  export function createElement(type: any, props?: any, ...children: any[]): ReactElement;
  export function useReducer<S, A>(reducer: Reducer<S, A>, initialState: S): [S, Dispatch<A>];
  export function useState<S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useRef<T>(initialValue: T): MutableRefObject<T>;
  export function useRef<T = undefined>(): MutableRefObject<T | undefined>;
  export function useEffect(effect: () => void | (() => void), deps?: readonly any[]): void;
  export function useMemo<T>(factory: () => T, deps: readonly any[] | undefined): T;
  export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: readonly any[]): T;

  export interface ChangeEvent<T = HTMLElement> {
    target: T & { value: string; checked?: boolean };
  }

  export interface MouseEvent<T = HTMLElement> {
    preventDefault(): void;
    stopPropagation(): void;
    target: T;
  }

  export interface KeyboardEvent<T = HTMLElement> {
    key: string;
    preventDefault(): void;
    stopPropagation(): void;
    target: T;
  }

  const React: {
    createElement: typeof createElement;
    useReducer: typeof useReducer;
    useState: typeof useState;
    useRef: typeof useRef;
    useEffect: typeof useEffect;
    useMemo: typeof useMemo;
    useCallback: typeof useCallback;
  };

  export default React;
}

declare module 'react-dom/client' {
  export interface Root {
    render(children: any): void;
    unmount(): void;
  }
  export function createRoot(container: Element | DocumentFragment): Root;
}

declare module 'react/jsx-runtime' {
  export function jsx(type: any, props: any, key?: any): any;
  export function jsxs(type: any, props: any, key?: any): any;
  export function jsxDEV(type: any, props: any, key?: any, isStatic?: boolean, source?: any, self?: any): any;
  export const Fragment: any;
}

declare namespace JSX {
  interface Element {
    type: any;
    props: any;
    key: any;
  }
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}
