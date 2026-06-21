import { storage } from 'wxt/utils/storage';

export type ISODate = string;

export type PopupView =
  | { kind: 'today' }
  | { kind: 'week'; weekOf: ISODate };

const popupViewItem = storage.defineItem<PopupView>('local:popupView', {
  fallback: { kind: 'today' },
});

export async function getPopupView(): Promise<PopupView> {
  return popupViewItem.getValue();
}

export async function setPopupView(view: PopupView): Promise<void> {
  await popupViewItem.setValue(view);
}