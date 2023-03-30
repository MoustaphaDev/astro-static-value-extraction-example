export function get(){
  return new Response(JSON.stringify({
    hello: "world"
  }))
}


export const myPageMetadata:string = 'Nice!!!';

export const cats = ['miaw', '1111']