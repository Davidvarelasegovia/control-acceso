/**
 * Prueba el campo "cargo" del panel de credenciales: escribir en el no debe
 * tumbar la pagina.
 *   Pegar en la consola del navegador con el panel abierto.
 */
window.__probarCampoCargo = async function () {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const setVal = (el, v) => {
    const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    s.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }

  // login si hace falta
  if (!document.querySelector('select')) {
    const ins = [...document.querySelectorAll('input')]
    setVal(ins[0], 'david')
    setVal(ins[1], '123456')
    ;[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Ingresar').click()
    await sleep(3500)
  }

  const entradas = () => [...document.querySelectorAll('input')]
  const antes = entradas().length
  const cargo = entradas()[3]

  cargo.focus()
  cargo.click()
  await sleep(150)
  setVal(cargo, 'Jefe de Turno')
  await sleep(1200)

  const despues = entradas().length
  return {
    inputsAntes: antes,
    inputsDespues: despues,
    valorCargo: entradas()[3] ? entradas()[3].value : 'SE CAYO',
    paginaViva: despues > 0,
  }
}
'listo: __probarCampoCargo()'